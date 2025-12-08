// public/src/components/OPTelaSelecaoEtapa.jsx

import React, { useState, useEffect, useMemo } from 'react';
import { obterProdutos as obterProdutosDoStorage } from '/js/utils/storage.js';
import FeedbackNotFound from './FeedbackNotFound.jsx';
import OPPaginacaoWrapper from './OPPaginacaoWrapper.jsx';
import BuscaInteligente, { filtrarListaInteligente } from './BuscaInteligente.jsx'; // <--- IMPORT

// Agora o Card recebe a imagem já calculada como prop
function OPEtapaCard({ etapa, onSelect, stepLabel, isFinal, imagemUrl }) {
    const bordaClasse = etapa.processo.toLowerCase() === 'corte' ? 'borda-corte' : '';
    
    // Lógica de exibição das OPs de origem
    const ops = etapa.origem_ops || [];
    let opsLabel = 'Nenhuma OP';
    
    if (ops.length > 0) {
        // Mostra até 4 OPs, depois coloca "..."
        const opsVisiveis = ops.slice(0, 4).join(', #');
        const resto = ops.length - 4;
        
        opsLabel = `Origem: OP #${opsVisiveis}`;
        if (resto > 0) {
            opsLabel += ` (+${resto})`;
        }
    }

    return (
        <div className="op-card-react" onClick={() => onSelect(etapa)}>
            <div className={`card-borda-charme ${bordaClasse}`}></div>
            <img src={imagemUrl || '/img/placeholder-image.png'} alt={etapa.produto_nome} className="card-imagem-produto" />
            
            <div className="card-info-principal" style={{display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                {/* Label da Etapa (Topo) */}
                <div style={{fontSize: '0.75rem', fontWeight: '700', color: isFinal ? '#e74c3c' : '#3498db', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px'}}>
                    {stepLabel}
                </div>

                <h3>{etapa.produto_nome}</h3>
                <p>{etapa.variante || 'Padrão'}</p>
                
                <div className="card-info-secundaria" style={{marginTop: '6px'}}>
                    <span className="info-item"><strong>{etapa.processo}</strong></span>
                </div>
            </div>

            <div className="card-bloco-pendente">
                <span className="label">DISPONÍVEL</span>
                <span className="valor">{etapa.quantidade_disponivel}</span>
            </div>

            {/* Rodapé Discreto com a Origem */}
            <div style={{
                gridColumn: '1 / -1', 
                borderTop: '1px solid #f0f0f0', 
                marginTop: '10px', 
                paddingTop: '8px', 
                fontSize: '0.75rem', 
                color: '#95a5a6',
                display: 'flex', 
                alignItems: 'center', 
                gap: '5px'
            }}>
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
    
    // NOVO ESTADO
    const [termoFiltro, setTermoFiltro] = useState('');
    const ITENS_POR_PAGINA = 6;

    useEffect(() => {
        async function buscarDados() {
            setCarregando(true);
            try {
                const token = localStorage.getItem('token');
                console.log('[DEBUG ATRIBUIR] Iniciando busca de tarefas...');

                const [dataFila, dataProdutos] = await Promise.all([
                    fetch('/api/producao/fila-de-tarefas', { headers: { 'Authorization': `Bearer ${token}` } }).then(res => res.json()),
                    obterProdutosDoStorage()
                ]);
                
                // --- LOGS DE DEBUG ---
                console.group('🔍 [DEBUG ATRIBUIR] Dados Recebidos');
                console.log('1. Fila Bruta (API):', dataFila);
                console.log('2. Total de Produtos no Cache:', dataProdutos.length);
                
                // Verifica se veio vazio
                if (dataFila.length === 0) {
                    console.warn('⚠️ A fila veio vazia. Verifique se há OPs com saldo disponível no backend.');
                } else {
                    // Loga os primeiros itens para conferência
                    console.table(dataFila.slice(0, 5).map(i => ({
                        ProdID: i.produto_id,
                        Nome: i.produto_nome,
                        Proc: i.processo,
                        Qtd: i.quantidade_disponivel,
                        OPs: i.origem_ops
                    })));
                }
                console.groupEnd();
                // ---------------------

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

    // --- FILTRO DE BUSCA INTELIGENTE ---
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

    // Paginação (Usa a lista final filtrada)
    const totalPaginas = Math.ceil(listaFinalFiltrada.length / ITENS_POR_PAGINA);
    const tarefasPaginadas = listaFinalFiltrada.slice(
        (pagina - 1) * ITENS_POR_PAGINA,
        pagina * ITENS_POR_PAGINA
    );

    // Resetar página ao buscar
    useEffect(() => { setPagina(1); }, [termoFiltro]);

    if (carregando) return <div className="spinner">Carregando fila...</div>;
    if (erro) return <p style={{ color: 'red', textAlign: 'center' }}>{erro}</p>;

    return (
        <div className="coluna-lista-produtos">
            
            {/* COMPONENTE DE BUSCA NO TOPO */}
            <div style={{marginBottom: '15px'}}>
                <BuscaInteligente 
                    onSearch={setTermoFiltro}
                    placeholder="Buscar tarefa por nome, cor ou etapa..."
                />
            </div>

            <div className="op-cards-container-modal">
                {tarefasPaginadas.length > 0 ? (
                    tarefasPaginadas.map((etapa) => {
                        const { label, isFinal, imagemUrl } = getEtapaInfo(etapa);
                        return (
                            <OPEtapaCard 
                                key={`${etapa.produto_id}-${etapa.variante}-${etapa.processo}`} 
                                etapa={etapa} stepLabel={label} isFinal={isFinal} imagemUrl={imagemUrl}
                                onSelect={onEtapaSelect}
                            />
                        );
                    })
                ) : (
                    <FeedbackNotFound
                        icon="fa-check-square"
                        titulo="Nenhuma Tarefa"
                        mensagem={termoFiltro ? `Nada encontrado para "${termoFiltro}".` : `Não há tarefas pendentes compatíveis com ${funcionario.nome}.`}
                    />
                )}
            </div>

            {totalPaginas > 1 && (
                <OPPaginacaoWrapper totalPages={totalPaginas} currentPage={pagina} onPageChange={setPagina} />
            )}
        </div>
    );
}