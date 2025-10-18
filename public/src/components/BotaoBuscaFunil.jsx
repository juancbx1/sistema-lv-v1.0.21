// public/src/components/BotaoBuscaFunil.jsx
import React, { useState, useEffect, useRef } from 'react';
import FeedbackNotFound from './FeedbackNotFound.jsx';
import { mostrarMensagem } from '/js/utils/popups.js';
import { renderizarPaginacao } from '/js/utils/Paginacao.js';
import { obterProdutos } from '/js/utils/storage.js';

// --- SUBCOMPONENTES ---

const TermometroEstoque = ({ niveis, saldoAtual }) => {
    if (!niveis || niveis.nivel_estoque_ideal === null || niveis.nivel_estoque_ideal <= 0) {
        return <div className="gs-termometro-vazio">Níveis de estoque não definidos.</div>;
    }

    const { nivel_reposicao_urgente, nivel_estoque_baixo, nivel_estoque_ideal } = niveis;
    const [fillPercent, setFillPercent] = useState(0);

    // Efeito para a animação de preenchimento
    useEffect(() => {
        const percent = Math.min((saldoAtual / nivel_estoque_ideal) * 100, 100);
        // Pequeno delay para garantir que a animação CSS seja acionada
        const timeoutId = setTimeout(() => setFillPercent(percent), 100);
        return () => clearTimeout(timeoutId);
    }, [saldoAtual, nivel_estoque_ideal]);

    const posUrgente = (nivel_reposicao_urgente / nivel_estoque_ideal) * 100;
    const posBaixo = (nivel_estoque_baixo / nivel_estoque_ideal) * 100;

    let classeStatus = 'saudavel';
    if (saldoAtual <= nivel_reposicao_urgente) classeStatus = 'critico';
    else if (saldoAtual <= nivel_estoque_baixo) classeStatus = 'atencao';

    // Adiciona uma classe específica para o estado de estoque zerado
    const isZerado = saldoAtual === 0;

    return (
        <div className="gs-termometro-container">
            {/* Adiciona a classe 'zerado' ao container principal se o estoque for zero */}
            <div className={`gs-termometro-barra ${isZerado ? 'zerado' : ''}`}>
                <div className={`gs-termometro-fill ${classeStatus}`} style={{ width: `${fillPercent}%` }}></div>
                {nivel_reposicao_urgente > 0 && <div className="gs-termometro-marcador urgente" style={{ left: `${posUrgente}%` }} title={`Urgente: ${nivel_reposicao_urgente}`}></div>}
                {nivel_estoque_baixo > 0 && <div className="gs-termometro-marcador baixo" style={{ left: `${posBaixo}%` }} title={`Baixo: ${nivel_estoque_baixo}`}></div>}
                <div className="gs-termometro-marcador ideal" style={{ left: `100%` }} title={`Ideal: ${nivel_estoque_ideal}`}></div>
            </div>
            <div className="gs-termometro-legenda">
                <span className={`legenda-item ${classeStatus}`}>Atual: <strong>{saldoAtual}</strong></span>
                <span className="legenda-item critico">Urgente: {nivel_reposicao_urgente}</span>
                <span className="legenda-item atencao">Baixo: {nivel_estoque_baixo}</span>
                <span className="legenda-item saudavel">Ideal: {nivel_estoque_ideal}</span>
            </div>
        </div>
    );
};

const CardDeStatus = ({ niveis, saldoAtual }) => {
    if (!niveis) return null;

    const { nivel_reposicao_urgente, nivel_estoque_baixo } = niveis;

    let statusInfo = {
        classe: 'saudavel',
        icone: 'fa-check-circle',
        titulo: 'ESTOQUE SAUDÁVEL',
        texto: 'Bom trabalho! O nível de estoque está adequado. Monitore o consumo para manter o nível ideal.'
    };

    if (saldoAtual <= nivel_reposicao_urgente) {
        statusInfo = {
            classe: 'critico',
            icone: 'fa-times-circle',
            titulo: 'ESTOQUE CRÍTICO',
            texto: 'A reposição deste item é prioridade máxima. Inicie uma nova Ordem de Produção o mais rápido possível.'
        };
    } else if (saldoAtual <= nivel_estoque_baixo) {
        statusInfo = {
            classe: 'atencao',
            icone: 'fa-exclamation-triangle',
            titulo: 'ESTOQUE DE ATENÇÃO',
            texto: 'O estoque está baixo. Programe a reposição para os próximos dias para evitar rupturas.'
        };
    }

    return (
        <div className={`gs-card-status ${statusInfo.classe}`}>
            <div className="gs-card-status-header">
                <i className={`fas ${statusInfo.icone}`}></i>
                <h4>{statusInfo.titulo}</h4>
            </div>
            <p>{statusInfo.texto}</p>
        </div>
    );
};

// --- A Tabela de Histórico (para o acordeão) ---
const TabelaHistorico = ({ historico, paginaAtual, setPagina, itensPorPagina }) => {
    const paginacaoRef = useRef(null);

    if (!historico || historico.length === 0) {
        return <p className="gs-acordeao-vazio">Nenhum histórico de movimentação encontrado.</p>;
    }

    // Lógica de paginação do array de histórico
    const totalPaginas = Math.ceil(historico.length / itensPorPagina);
    const inicio = (paginaAtual - 1) * itensPorPagina;
    const fim = inicio + itensPorPagina;
    const historicoDaPagina = historico.slice(inicio, fim);

    // Efeito para renderizar a paginação legada
    useEffect(() => {
        if (paginacaoRef.current) {
            renderizarPaginacao(
                paginacaoRef.current,
                totalPaginas,
                paginaAtual,
                setPagina // Passa a função de mudar de página diretamente
            );
        }
    }, [historico, paginaAtual, totalPaginas, setPagina]); // Adicionei setPagina às dependências para garantir a atualização

    return (
        <div>
            <table className="gs-historico-tabela">
                <thead>
                    <tr>
                        <th>Data</th>
                        <th>Tipo</th>
                        <th>Qtd.</th>
                        <th>Responsável</th>
                    </tr>
                </thead>
                <tbody>
                    {historicoDaPagina.map(mov => (
                        <tr key={mov.id}>
                            <td>{new Date(mov.data_movimento).toLocaleString('pt-BR')}</td>
                            <td>{mov.tipo_movimento.replace(/_/g, ' ')}</td>
                            <td className={mov.quantidade > 0 ? 'positivo' : 'negativo'}>{mov.quantidade}</td>
                            <td>{mov.usuario_responsavel}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {/* Container para a paginação */}
            <div ref={paginacaoRef} className="gs-paginacao-container" style={{ marginTop: '15px' }}></div>
        </div>
    );
};

// ---  Um item da lista de componentes do Kit (para o acordeão) ---
const AcordeaoItemComponente = ({ item, todosOsProdutos, estagio }) => {
    const pluralizePeca = (qtd) => (qtd === 1 ? 'pç' : 'pçs');
    
    let imagemSrc = '/img/placeholder-image.png';
    const produtoDef = todosOsProdutos.find(p => p.id === item.produto_id);

    if (produtoDef) {
        const gradeDef = produtoDef.grade?.find(g => g.variacao === item.variante);
        if (gradeDef && gradeDef.imagem) {
            imagemSrc = gradeDef.imagem;
        } 
        else if (produtoDef.imagem) {
            imagemSrc = produtoDef.imagem;
        }
    }

    return (
        <div className="gs-acordeao-item-com-imagem">
            <img src={imagemSrc} alt={item.nome} className="gs-acordeao-item-imagem" />
            <div className="info">
                <span className="nome">{item.nome}</span>
                <span className="variante">{item.variante || 'Padrão'}</span>
            </div>
            <div className="saldos">
                {estagio === 'embalagem' && (
                    <span>Necessário: <strong>{item.quantidade_no_kit} {pluralizePeca(item.quantidade_no_kit)}</strong></span>
                )}
                {item.saldoArremate !== undefined && <span>Arremate: <strong>{item.saldoArremate} {pluralizePeca(item.saldoArremate)}</strong></span>}
                {item.saldoEmbalagem !== undefined && <span>Embalagem: <strong>{item.saldoEmbalagem} {pluralizePeca(item.saldoEmbalagem)}</strong></span>}
            </div>
        </div>
    );
};

// --- O estágio clicável do funil (o Acordeão) ---
const FunilEstagio = ({ estagio, onToggle, isAberto }) => (
    <div className={`gs-funil-estagio ${estagio.desativado ? 'desativado' : ''} ${estagio.conteudoAcordeao ? 'clicavel' : ''}`}
         onClick={estagio.conteudoAcordeao ? onToggle : null} style={{ borderLeftColor: estagio.cor }}>
        <div className="gs-funil-estagio-icone" style={{ backgroundColor: estagio.cor }}><i className={`fas ${estagio.icone}`}></i></div>
        <div className="gs-funil-estagio-info">
            <span className="gs-funil-estagio-titulo">{estagio.titulo}</span>
            <span className="gs-funil-estagio-subinfo">{estagio.dados.info}</span>
        </div>
        <div className="gs-funil-estagio-valor">{estagio.dados.qtd}</div>
        {estagio.conteudoAcordeao && (
            <div className="gs-funil-acordeao-seta">
                <i className={`fas ${isAberto ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
            </div>
        )}
    </div>
);

// --- O Visualizador Inteligente (o coração da tela de detalhes) ---
const FunilView = ({ dados, onVoltar, todosOsProdutos }) => { 
    const { produto, funil, niveisEstoque, historicoEstoque, componentes } = dados;
    const [acordeaoAberto, setAcordeaoAberto] = useState(null);
    const [paginaHistorico, setPaginaHistorico] = useState(1);
    const ITENS_POR_PAGINA_HISTORICO = 5;

    const handleToggleAcordeao = (nomeEstagio) => {
        setPaginaHistorico(1); // Reseta a paginação ao abrir/fechar um acordeão
        setAcordeaoAberto(acordeaoAberto === nomeEstagio ? null : nomeEstagio);
    };

    let estagios = [];
    if (produto.is_kit) {
        const componentesComSaldoArremate = componentes.filter(c => c.saldoArremate > 0).length;
        const componentesComSaldoEmbalagem = componentes.filter(c => c.saldoEmbalagem > 0).length;
        estagios = [
            { nome: 'arremate', icone: 'fa-cut', titulo: 'Componentes no Arremate', cor: 'var(--gs-primaria)',
              dados: { qtd: `${componentesComSaldoArremate}/${componentes.length}`, info: 'Componentes com saldo' },
              conteudoAcordeao: componentes.map(c => ({...c, saldoEmbalagem: undefined}))
            },
            { nome: 'embalagem', icone: 'fa-box', titulo: 'Componentes na Embalagem', cor: 'var(--gs-primaria)',
              dados: { qtd: `${componentesComSaldoEmbalagem}/${componentes.length}`, info: 'Componentes com saldo' },
              conteudoAcordeao: componentes.map(c => ({...c, saldoArremate: undefined}))
            },
            { nome: 'estoque', icone: 'fa-check-circle', titulo: 'Kit Pronto em Estoque', cor: 'var(--gs-sucesso)',
              dados: { qtd: `${funil.emEstoque.qtd} pçs`, info: '' },
              conteudoAcordeao: historicoEstoque
            }
        ];
    } else {
        estagios = [
            { nome: 'produzir', icone: 'fa-cogs', titulo: 'Para Produzir', dados: { qtd: '---', info: 'Cálculo de necessidade em breve' }, cor: '#aeb6bf', desativado: true },
            { nome: 'arremate', icone: 'fa-cut', titulo: 'No Arremate', dados: { qtd: `${funil.noArremate.qtd} pçs` }, cor: 'var(--gs-primaria)' },
            { nome: 'embalagem', icone: 'fa-box', titulo: 'Na Embalagem', dados: { qtd: `${funil.naEmbalagem.qtd} pçs` }, cor: 'var(--gs-primaria)' },
            { nome: 'estoque', icone: 'fa-check-circle', titulo: 'Em Estoque', dados: { qtd: `${funil.emEstoque.qtd} pçs` }, cor: 'var(--gs-sucesso)',
              conteudoAcordeao: historicoEstoque
            }
        ];
    }

    return (
        <div className="gs-radar-conteudo-funil">
            <button onClick={onVoltar} className="gs-funil-nav-btn"><i className="fas fa-arrow-left"></i> Voltar</button>
            <div className="gs-radar-funil-identificacao">
                <img src={produto.imagem || '/img/placeholder-image.png'} alt={produto.nome} className="gs-radar-funil-imagem" />
                <div className="gs-radar-funil-info">
                    <h4>
                        {produto.nome}
                        {produto.is_kit && <span className="gs-tag-kit">KIT</span>}
                    </h4>
                    <span className="variante-principal">{produto.variante || 'Padrão'}</span>
                    <span className="sku-principal">SKU: {produto.sku}</span>
                </div>
            </div>

            <h5 className="gs-funil-secao-titulo">Diagnóstico de Estoque</h5>
            
            <CardDeStatus niveis={niveisEstoque} saldoAtual={funil.emEstoque.qtd} />
            <TermometroEstoque niveis={niveisEstoque} saldoAtual={funil.emEstoque.qtd} />

            <h5 className="gs-funil-secao-titulo">Funil de Produção</h5>
            
            {produto.is_kit && (
                <div className="gs-funil-potencial-montagem">
                    <span>Potencial de Montagem</span>
                    <span className="valor">{produto.potencial_montagem} kits</span>
                </div>
            )}
            <div className="gs-funil-pipeline-container">
                {estagios.map(estagio => (
                    <div key={estagio.nome}>
                        <FunilEstagio estagio={estagio} onToggle={() => handleToggleAcordeao(estagio.nome)} isAberto={acordeaoAberto === estagio.nome} />
                        {acordeaoAberto === estagio.nome && (
                            <div className="gs-acordeao-conteudo">
                                {estagio.nome === 'estoque'
                                    ? <TabelaHistorico historico={estagio.conteudoAcordeao} paginaAtual={paginaHistorico} setPagina={setPaginaHistorico} itensPorPagina={ITENS_POR_PAGINA_HISTORICO} />
                                    : estagio.conteudoAcordeao.map(item => (
                                        <AcordeaoItemComponente 
                                            key={item.nome + item.variante} 
                                            item={item} 
                                            todosOsProdutos={todosOsProdutos}
                                            // NOVIDADE: Informa ao componente qual estágio ele está renderizando
                                            estagio={estagio.nome} 
                                        />
                                    ))
                                }
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

const ListaDeResultados = ({ resultados, onSelecionar, onVoltar, paginacaoInfo, onPageChange }) => {
    const paginacaoRef = useRef(null);
    useEffect(() => {
        if (paginacaoRef.current && paginacaoInfo) {
            renderizarPaginacao(
                paginacaoRef.current,
                paginacaoInfo.totalPages,
                paginacaoInfo.currentPage,
                onPageChange
            );
        }
    }, [paginacaoInfo, onPageChange]);
    return (
        <div className="gs-busca-lista-resultados">
            <button onClick={onVoltar} className="gs-funil-nav-btn gs-busca-voltar-btn">
                <i className="fas fa-arrow-left"></i> Nova busca
            </button>
            <h4>Resultados da Busca ({paginacaoInfo.totalItems})</h4>
            {resultados.map(item => (
                <div className="gs-busca-item-resultado" key={item.sku} onClick={() => onSelecionar(item)}>
                    <img src={item.imagem || '/img/placeholder-image.png'} alt={item.nome} />
                    <div className="info">
                        <span className="nome">{item.nome}</span>
                        <span className="variante">{item.variante}</span>
                    </div>
                    <i className="fas fa-chevron-right"></i>
                </div>
            ))}
            <div ref={paginacaoRef} className="gs-paginacao-container" style={{ marginTop: '20px' }}></div>
        </div>
    );
};


// --- COMPONENTE PRINCIPAL ---
export default function BotaoBuscaFunil() {
    const [modalAberto, setModalAberto] = useState(false);
    const [carregando, setCarregando] = useState(false);
    const [termoBusca, setTermoBusca] = useState('');
    const [listaResultados, setListaResultados] = useState([]);
    const [itemSelecionado, setItemSelecionado] = useState(null);
    const [buscou, setBuscou] = useState(false);
    const [paginacao, setPaginacao] = useState(null);
    const [paginaAtual, setPaginaAtual] = useState(1);
    const [termoBuscaAnterior, setTermoBuscaAnterior] = useState('');

    // Estado para guardar a lista completa de produtos
    const [todosOsProdutos, setTodosOsProdutos] = useState([]);

     // Efeito que busca os produtos UMA VEZ quando o componente é montado
    useEffect(() => {
        const carregarProdutos = async () => {
            try {
                const produtos = await obterProdutos(true); // `true` para forçar a busca se não estiver em cache
                setTodosOsProdutos(produtos || []);
            } catch (error) {
                console.error("Erro ao carregar a lista de produtos no componente BotaoBuscaFunil:", error);
                mostrarMensagem("Não foi possível carregar os dados dos produtos. Algumas imagens podem não aparecer.", "aviso");
            }
        };
        carregarProdutos();
    }, []);

    const executarBuscaDeLista = async (termo, page = 1) => {
        if (termo.trim().length < 2) return;
        setCarregando(true);
        setBuscou(true);
        setItemSelecionado(null);
        setListaResultados([]);
        setTermoBuscaAnterior(termo);

        try {
            const token = localStorage.getItem('token');
            const url = `/api/radar-producao/buscar?termo=${encodeURIComponent(termo)}&page=${page}&limit=5`;
            const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await response.json();
            
            if (data.rows && data.rows.length === 1 && data.pagination.totalItems === 1) {
                await executarBuscaDeFunil(data.rows[0]);
            } else if (data.rows) {
                setListaResultados(data.rows);
                setPaginacao(data.pagination);
            }
        } catch (error) {
            mostrarMensagem(`Erro: ${error.message}`, 'erro');
        } finally {
            setCarregando(false);
        }
    };
    
    useEffect(() => {
        if (buscou && termoBuscaAnterior) {
            executarBuscaDeLista(termoBuscaAnterior, paginaAtual);
        }
    }, [paginaAtual]);

    const executarBuscaDeFunil = async (item) => {
        setCarregando(true);
        setItemSelecionado(null); 
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/radar-producao/funil?busca=${encodeURIComponent(item.sku)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                const err = await response.json(); throw new Error(err.error || 'Erro na busca.');
            }
            const data = await response.json();
            setItemSelecionado(data);
        } catch (error) {
            mostrarMensagem(`Erro: ${error.message}`, 'erro');
            setItemSelecionado(null);
        } finally {
            setCarregando(false);
        }
    };

    const handleBuscaSubmit = (e) => {
        e.preventDefault();
        setPaginaAtual(1);
        executarBuscaDeLista(termoBusca, 1);
    };

    const handleSelectRecente = (item) => {
        setTermoBusca(`${item.nome} ${item.variante || ''}`.trim());
        executarBuscaDeFunil(item);
    };

    useEffect(() => {
        // Esta é a função "tradutora" que ouve o evento global
        const handleConsultaExterna = (event) => {
            // 1. Extrai o objeto 'item' que o RadarDeAlertas enviou
            const item = event.detail; 

            // 2. Verifica se o item existe e tem as informações que precisamos (sku é crucial)
            if (item && item.sku) {
                setModalAberto(true); // Garante que o modal esteja aberto
                
                // 3. Define o termo de busca na barra para o usuário ver o que foi selecionado
                setTermoBusca(`${item.nome} ${item.variante || ''}`.trim());
                
                // 4. Chama a função de busca do funil, passando o objeto 'item' correto
                executarBuscaDeFunil(item); 
            }
        };

        window.addEventListener('radar:consultarFunil', handleConsultaExterna);

        // A função de limpeza remove o listener quando o componente é desmontado
        return () => {
            window.removeEventListener('radar:consultarFunil', handleConsultaExterna);
        };
    }, []);

    const fecharModal = () => {
        setModalAberto(false);
        setTermoBusca('');
        setListaResultados([]);
        setItemSelecionado(null);
        setBuscou(false);
        setTermoBuscaAnterior('');
        setPaginaAtual(1);
    };
    
    const voltarParaResultados = () => {
        setItemSelecionado(null);
    };

    const voltarParaBusca = () => {
        setListaResultados([]);
        setItemSelecionado(null);
        setBuscou(false);
        setTermoBusca('');
    };

    const renderizarConteudo = () => {
        if (carregando) return <div className="spinner">Buscando...</div>;

        if (itemSelecionado) {
            // NOVIDADE: Passa a lista de produtos para o FunilView
            return <FunilView 
                        dados={itemSelecionado} 
                        onVoltar={voltarParaResultados} 
                        todosOsProdutos={todosOsProdutos}
                    />;
        }

        if (listaResultados.length > 0) {
            return <ListaDeResultados 
                        resultados={listaResultados} 
                        onSelecionar={executarBuscaDeFunil} 
                        onVoltar={voltarParaBusca} 
                        paginacaoInfo={paginacao}
                        onPageChange={setPaginaAtual}
                    />;
        }
        
        if (buscou) {
            return <FeedbackNotFound icon="fa-box-open" titulo="Nenhum Produto Encontrado" mensagem="Não encontramos produtos ATIVOS que correspondam à sua busca." />;
        }

        return <div style={{textAlign: 'center', color: 'var(--gs-texto-secundario)', marginTop: '30px'}}>Digite para consultar o funil completo de um produto.</div>;
    };

    // O restante do componente permanece como na sua versão funcional
    if (!modalAberto) {
        return (
            <button className="gs-fab-busca" title="Consultar Funil de Produto" onClick={() => setModalAberto(true)}>
                <i className="fas fa-search"></i>
            </button>
        );
    }

    return (
        <div className="gs-busca-modal-overlay" onClick={fecharModal}>
            <div className="gs-busca-modal-conteudo" onClick={(e) => e.stopPropagation()}>
                <div className="gs-busca-modal-header">
                    <h3>Consultar Funil de Produto</h3>
                    <button onClick={fecharModal} className="gs-busca-modal-fechar">&times;</button>
                </div>
                <div className="gs-busca-modal-body">
                    {/* A lógica de exibição do formulário da sua versão, que está correta */}
                    {!itemSelecionado && (
                        <form onSubmit={handleBuscaSubmit} className="gs-busca-wrapper" style={{display: 'flex', gap: '10px'}}>
                            <input type="text" className="gs-input" placeholder="Digite a cor ou nome do produto..." value={termoBusca} onChange={(e) => setTermoBusca(e.target.value)} autoFocus />
                            <button type="submit" className="gs-btn gs-btn-primario" disabled={carregando}>
                                {carregando ? <div className="spinner-btn-interno"></div> : 'Buscar'}
                            </button>
                        </form>
                    )}
                    <div className="gs-busca-modal-resultados">
                        {renderizarConteudo()}
                    </div>
                </div>
            </div>
        </div>
    );
}
