// public/src/components/OPTelaSelecaoEtapa.jsx

import React, { useState, useEffect, useMemo } from 'react';
import { obterProdutos as obterProdutosDoStorage } from '/js/utils/storage.js';
import FeedbackNotFound from './FeedbackNotFound.jsx';
import OPPaginacaoWrapper from './OPPaginacaoWrapper.jsx';

// Agora o Card recebe a imagem já calculada como prop
function OPEtapaCard({ etapa, onSelect, stepLabel, isFinal, imagemUrl }) {
    const bordaClasse = etapa.processo.toLowerCase() === 'corte' ? 'borda-corte' : '';
    
    const opsLabel = etapa.origem_ops && etapa.origem_ops.length > 0 
        ? `OP #${etapa.origem_ops.join(', #')}` 
        : 'OP S/N';

    return (
        <div className="op-card-react" onClick={() => onSelect(etapa)}>
            <div className={`card-borda-charme ${bordaClasse}`}></div>
            <img src={imagemUrl || '/img/placeholder-image.png'} alt={etapa.produto_nome} className="card-imagem-produto" />
            <div className="card-info-principal">
                <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '4px'}}>
                    <span style={{fontWeight: '700', color: isFinal ? '#e74c3c' : '#3498db'}}>{stepLabel.toUpperCase()}</span>
                    <span style={{color: '#7f8c8d', fontWeight: '600'}}>{opsLabel}</span>
                </div>
                <h3>{etapa.produto_nome}</h3>
                <p>{etapa.variante || 'Padrão'}</p>
                <div className="card-info-secundaria" style={{marginTop: '5px'}}>
                    <span className="info-item"><strong>{etapa.processo}</strong></span>
                </div>
            </div>
            <div className="card-bloco-pendente">
                <span className="label">DISPONÍVEL</span>
                <span className="valor">{etapa.quantidade_disponivel}</span>
            </div>
        </div>
    );
}

export default function OPTelaSelecaoEtapa({ onEtapaSelect, funcionario }) {
    const [filaDeTarefas, setFilaDeTarefas] = useState([]);
    const [todosProdutos, setTodosProdutos] = useState([]);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState(null);
    
    // Novo estado para paginação
    const [pagina, setPagina] = useState(1);
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

    // --- LÓGICA DE PAGINAÇÃO NO FRONTEND ---
    const totalPaginas = Math.ceil(tarefasFiltradasParaFuncionario.length / ITENS_POR_PAGINA);
    const tarefasPaginadas = tarefasFiltradasParaFuncionario.slice(
        (pagina - 1) * ITENS_POR_PAGINA,
        pagina * ITENS_POR_PAGINA
    );

    if (carregando) return <div className="spinner">Carregando fila de tarefas...</div>;
    if (erro) return <p style={{ color: 'red', textAlign: 'center' }}>{erro}</p>;

    return (
        <div className="coluna-lista-produtos">
            <div className="op-cards-container-modal">
                {tarefasPaginadas.length > 0 ? (
                    tarefasPaginadas.map((etapa) => {
                        const { label, isFinal, imagemUrl } = getEtapaInfo(etapa);
                        return (
                            <OPEtapaCard 
                                key={`${etapa.produto_id}-${etapa.variante}-${etapa.processo}`} 
                                etapa={etapa} 
                                stepLabel={label} 
                                isFinal={isFinal}
                                imagemUrl={imagemUrl}
                                onSelect={onEtapaSelect}
                            />
                        );
                    })
                ) : (
                    <FeedbackNotFound
                        icon="fa-check-square"
                        titulo="Nenhuma Tarefa Compatível"
                        mensagem={`Não há tarefas pendentes na fila de produção que sejam compatíveis com o perfil de "${funcionario.nome}".`}
                    />
                )}
            </div>

            {/* ADICIONA O WRAPPER DE PAGINAÇÃO SE HOUVER MAIS DE 1 PÁGINA */}
            {totalPaginas > 1 && (
                <OPPaginacaoWrapper 
                    totalPages={totalPaginas}
                    currentPage={pagina}
                    onPageChange={setPagina}
                />
            )}
        </div>
    );
}