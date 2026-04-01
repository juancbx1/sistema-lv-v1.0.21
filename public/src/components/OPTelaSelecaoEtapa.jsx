// public/src/components/OPTelaSelecaoEtapa.jsx

import React, { useState, useEffect, useMemo } from 'react';
import { obterProdutos as obterProdutosDoStorage } from '/js/utils/storage.js';
import UIFeedbackNotFound from './UIFeedbackNotFound.jsx';
import OPPaginacaoWrapper from './OPPaginacaoWrapper.jsx';
import UIBuscaInteligente, { filtrarListaInteligente } from './UIBuscaInteligente.jsx';

function OPEtapaCard({ etapa, onToggle, stepLabel, isFinal, imagemUrl, selecionado }) {
    const bordaClasse = etapa.processo.toLowerCase() === 'corte'
        ? 'borda-corte'
        : isFinal
            ? 'borda-etapa-final'
            : 'borda-etapa-normal';

    const ops = etapa.origem_ops || [];
    let opsLabel = ops.length > 0 ? `Origem: OP #${ops.slice(0, 4).join(', #')}` : 'Nenhuma OP';
    if (ops.length > 4) opsLabel += ` (+${ops.length - 4})`;

    return (
        <div
            className={`op-card-react ${selecionado ? 'selecionado-lote' : ''}`}
            onClick={() => onToggle(etapa)}
            style={{
                cursor: 'pointer',
                border: selecionado ? '2px solid var(--op-cor-azul-claro)' : '1px solid transparent',
                backgroundColor: selecionado ? '#f0f8ff' : '#fff'
            }}
        >
            <div className={`card-borda-charme ${bordaClasse}`}></div>

            <div className="op-card-checkbox-wrapper">
                <div className={`op-card-checkbox ${selecionado ? 'marcado' : ''}`}></div>
            </div>

            <img src={imagemUrl || '/img/placeholder-image.png'} alt={etapa.produto_nome} className="card-imagem-produto" />

            <div className="card-info-principal">
                <div className={`card-etapa-label ${isFinal ? 'borda-etapa-final' : 'borda-etapa-normal'}`}
                     style={{ fontSize: '0.75rem', fontWeight: '700', marginBottom: '4px', textTransform: 'uppercase',
                              color: isFinal ? '#e74c3c' : '#3498db' }}>
                    {stepLabel}
                </div>
                <h3>{etapa.produto_nome}</h3>
                <p>{etapa.variante || 'Padrão'}</p>
                <div className="card-info-secundaria" style={{ marginTop: '6px' }}>
                    <span className="info-item"><strong>{etapa.processo}</strong></span>
                </div>
            </div>

            <div className="card-bloco-pendente">
                <span className="label">DISPONÍVEL</span>
                <span className="valor">{etapa.quantidade_disponivel}</span>
            </div>

            <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #f0f0f0', marginTop: '10px', paddingTop: '8px', fontSize: '0.75rem', color: '#95a5a6' }}>
                <i className="fas fa-link"></i> {opsLabel}
            </div>
        </div>
    );
}

export default function OPTelaSelecaoEtapa({ onEtapaSelect, funcionario }) {
    const [filaDeTarefas, setFilaDeTarefas] = useState([]);
    const [todosProdutos, setTodosProdutos] = useState([]);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState(null);
    const [pagina, setPagina] = useState(1);

    const [termoFiltro, setTermoFiltro] = useState('');
    const [selecionados, setSelecionados] = useState([]);
    const ITENS_POR_PAGINA = 6;

    useEffect(() => {
        async function buscarDados() {
            setCarregando(true);
            try {
                const token = localStorage.getItem('token');
                const [dataFila, dataProdutos] = await Promise.all([
                    fetch('/api/producao/fila-de-tarefas', { headers: { 'Authorization': `Bearer ${token}` } }).then(res => res.json()),
                    obterProdutosDoStorage()
                ]);

                setFilaDeTarefas(dataFila);
                setTodosProdutos(dataProdutos);
            } catch (err) {
                console.error('[DEBUG ATRIBUIR] Erro:', err);
                setErro(err.message);
            } finally {
                setCarregando(false);
            }
        }
        buscarDados();
    }, []);

    const tarefasFiltradasParaFuncionario = useMemo(() => {
        if (!funcionario?.tipos || todosProdutos.length === 0) return [];
        return filaDeTarefas.filter(tarefa => {
            const produto = todosProdutos.find(p => p.id === tarefa.produto_id);
            if (!produto?.etapas) return false;
            const etapaConfig = produto.etapas.find(e => (e.processo || e) === tarefa.processo);
            if (!etapaConfig) return false;
            return funcionario.tipos.includes(etapaConfig.feitoPor);
        });
    }, [filaDeTarefas, todosProdutos, funcionario]);

    const listaFinalFiltrada = useMemo(() => {
        return filtrarListaInteligente(tarefasFiltradasParaFuncionario, termoFiltro, ['produto_nome', 'variante', 'processo']);
    }, [tarefasFiltradasParaFuncionario, termoFiltro]);

    const getEtapaInfo = (tarefa) => {
        const produto = todosProdutos.find(p => p.id === tarefa.produto_id);
        if (!produto || !produto.etapas) return { label: 'Etapa ?', isFinal: false, imagemUrl: null };
        const index = produto.etapas.findIndex(e => (e.processo || e) === tarefa.processo);
        const total = produto.etapas.length;
        const isFinal = index === total - 1;
        const label = isFinal ? 'Etapa Final' : `Etapa ${index + 1}`;
        let imagemUrl = produto.imagem;
        if (tarefa.variante && produto.grade) {
            const variacaoItem = produto.grade.find(g => g.variacao === tarefa.variante);
            if (variacaoItem && variacaoItem.imagem) imagemUrl = variacaoItem.imagem;
        }
        return { label, isFinal, imagemUrl };
    };

    const handleToggleSelect = (etapa) => {
        const etapaId = `${etapa.produto_id}-${etapa.variante}-${etapa.processo}`;
        setSelecionados(prev => {
            const jaSelecionado = prev.find(i => `${i.produto_id}-${i.variante}-${i.processo}` === etapaId);
            if (jaSelecionado) {
                return prev.filter(i => `${i.produto_id}-${i.variante}-${i.processo}` !== etapaId);
            } else {
                if (prev.length >= 6) return prev;
                return [...prev, etapa];
            }
        });
    };

    const handleAvancarLote = () => {
        if (selecionados.length > 0) {
            onEtapaSelect(selecionados);
        }
    };

    const totalPaginas = Math.ceil(listaFinalFiltrada.length / ITENS_POR_PAGINA);
    const tarefasPaginadas = listaFinalFiltrada.slice(
        (pagina - 1) * ITENS_POR_PAGINA,
        pagina * ITENS_POR_PAGINA
    );

    useEffect(() => { setPagina(1); }, [termoFiltro]);

    if (carregando) return <div className="spinner">Carregando fila...</div>;
    if (erro) return <p style={{ color: 'red', textAlign: 'center' }}>{erro}</p>;

    const totalDisponivel = tarefasFiltradasParaFuncionario.length;
    const totalFiltrado = listaFinalFiltrada.length;
    const textoMeta = termoFiltro
        ? `${totalFiltrado} resultado${totalFiltrado !== 1 ? 's' : ''} de ${totalDisponivel}`
        : `${totalDisponivel} tarefa${totalDisponivel !== 1 ? 's' : ''} disponível${totalDisponivel !== 1 ? 'is' : ''}`;

    const qtdSelecionados = selecionados.length;
    const textoBotao = qtdSelecionados === 1 ? 'Atribuir 1 Tarefa' : `Atribuir ${qtdSelecionados} Tarefas`;

    return (
        <div className="coluna-lista-produtos">

            <div style={{ marginBottom: '6px' }}>
                <UIBuscaInteligente onSearch={setTermoFiltro} placeholder="Buscar por produto, variante ou processo..." />
            </div>

            <p className="op-busca-meta">{textoMeta}</p>

            <div className="op-cards-container-modal">
                {tarefasPaginadas.length > 0 ? (
                    tarefasPaginadas.map((etapa) => {
                        const { label, isFinal, imagemUrl } = getEtapaInfo(etapa);
                        const etapaId = `${etapa.produto_id}-${etapa.variante}-${etapa.processo}`;
                        const isSelected = selecionados.some(i => `${i.produto_id}-${i.variante}-${i.processo}` === etapaId);

                        return (
                            <OPEtapaCard
                                key={etapaId}
                                etapa={etapa}
                                stepLabel={label}
                                isFinal={isFinal}
                                imagemUrl={imagemUrl}
                                selecionado={isSelected}
                                onToggle={handleToggleSelect}
                            />
                        );
                    })
                ) : (
                    <UIFeedbackNotFound icon="fa-check-square" titulo="Nenhuma Tarefa" mensagem="..." />
                )}
            </div>

            {totalPaginas > 1 && (
                <OPPaginacaoWrapper totalPages={totalPaginas} currentPage={pagina} onPageChange={setPagina} />
            )}

            {qtdSelecionados > 0 && (
                <div className="op-selecao-barra">
                    <span className="op-selecao-barra-count">
                        <i className="fas fa-check-circle"></i> {qtdSelecionados} selecionada{qtdSelecionados !== 1 ? 's' : ''}
                    </span>
                    <button className="op-selecao-barra-btn" onClick={handleAvancarLote}>
                        <i className="fas fa-check-double"></i> {textoBotao}
                    </button>
                </div>
            )}
        </div>
    );
}
