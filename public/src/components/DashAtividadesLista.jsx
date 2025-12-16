import React, { useState, useEffect, useMemo } from 'react';

export default function DashAtividadesLista({ atividades, aoAtualizar }) {
    const [filtroPeriodo, setFiltroPeriodo] = useState('hoje');
    const [dataEspecifica, setDataEspecifica] = useState(''); // Formato YYYY-MM-DD
    const [termoBusca, setTermoBusca] = useState('');
    const [paginaAtual, setPaginaAtual] = useState(1);
    const ITENS_POR_PAGINA = 8;

    // Função auxiliar para pegar data local YYYY-MM-DD
    const getDataLocalISO = (d = new Date()) => {
        const ano = d.getFullYear();
        const mes = String(d.getMonth() + 1).padStart(2, '0');
        const dia = String(d.getDate()).padStart(2, '0');
        return `${ano}-${mes}-${dia}`;
    };

    // Inicializa com a data de hoje
    useEffect(() => {
        setDataEspecifica(getDataLocalISO());
    }, []);

    // --- FUNÇÕES DE CONTROLE DE FILTRO ---
    const selecionarHoje = () => {
        setFiltroPeriodo('hoje');
        setDataEspecifica(getDataLocalISO(new Date())); // Atualiza o input visualmente
        setTermoBusca('');
    };

    const selecionarOntem = () => {
        setFiltroPeriodo('ontem');
        const ontem = new Date();
        ontem.setDate(ontem.getDate() - 1);
        setDataEspecifica(getDataLocalISO(ontem)); // Atualiza o input visualmente
        setTermoBusca('');
    };

    const selecionarEspecifico = (e) => {
        const novaData = e.target.value;
        setDataEspecifica(novaData);
        setFiltroPeriodo('especifico');
        setTermoBusca('');
    };

    // --- Lógica de Filtro ---
    const atividadesFiltradas = useMemo(() => {
        if (!atividades || !Array.isArray(atividades)) return [];
        let lista = [...atividades];

        // 1. Filtro Texto
        if (termoBusca.trim().length > 0) {
            const termo = termoBusca.toLowerCase();
            return lista.filter(item => {
                const op = item.op_numero ? String(item.op_numero) : '';
                const prod = item.produto ? item.produto.toLowerCase() : '';
                return op.includes(termo) || prod.includes(termo);
            });
        }

        // 2. Filtro Data
        const dataAlvoStr = dataEspecifica; // Já está em YYYY-MM-DD
        
        // Converte a data da atividade (ISO) para YYYY-MM-DD local para comparar
        lista = lista.filter(item => {
            const d = new Date(item.data);
            const dataItemStr = getDataLocalISO(d);
            return dataItemStr === dataAlvoStr;
        });

        // Ordenação
        return lista.sort((a, b) => new Date(b.data) - new Date(a.data));
    }, [atividades, dataEspecifica, termoBusca]); // filtroPeriodo agora é implícito pela dataEspecifica

    // Totalizadores
    const totalQtd = atividadesFiltradas.reduce((acc, item) => acc + (Number(item.quantidade) || 0), 0);
    const totalPontos = atividadesFiltradas.reduce((acc, item) => acc + (Number(item.pontos_gerados) || 0), 0);

    // Paginação
    const totalPaginas = Math.ceil(atividadesFiltradas.length / ITENS_POR_PAGINA);
    
    useEffect(() => {
        setPaginaAtual(1);
    }, [dataEspecifica, termoBusca]);

    const indiceInicial = (paginaAtual - 1) * ITENS_POR_PAGINA;
    const itensPagina = atividadesFiltradas.slice(indiceInicial, indiceInicial + ITENS_POR_PAGINA);

    const fmtData = (iso) => new Date(iso).toLocaleDateString('pt-BR');
    const fmtHora = (iso) => new Date(iso).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});

    return (
        <section className="ds-card ds-painel-detalhamento">
            <h2 className="ds-card-titulo">Detalhamento das Atividades</h2>
            
            {/* Filtros */}
            <div className="ds-controles-detalhamento" style={{marginBottom:'20px'}}>
                <div style={{display:'flex', gap:'10px', marginBottom:'10px'}}>
                    <input 
                        type="text" 
                        className="ds-input" 
                        placeholder="Buscar OP ou Produto..." 
                        value={termoBusca}
                        onChange={(e) => setTermoBusca(e.target.value)}
                        style={{flexGrow:1}}
                    />
                    <button className="ds-btn ds-btn-outline-primario" onClick={aoAtualizar} title="Recarregar">
                        <i className="fas fa-sync-alt"></i>
                    </button>
                </div>

                <div className="ds-filtros-ativos-container" style={{display:'flex', gap:'10px', alignItems:'center', flexWrap:'wrap'}}>
                    <span style={{fontWeight:'600', fontSize:'0.9rem', color:'#666'}}>Período:</span>
                    
                    <button 
                        className={`ds-btn ds-btn-pequeno ${filtroPeriodo === 'hoje' ? 'ds-btn-filtro-ativo' : 'ds-btn-filtro-inativo'}`} 
                        onClick={selecionarHoje}
                    >
                        Hoje
                    </button>
                    
                    <button 
                        className={`ds-btn ds-btn-pequeno ${filtroPeriodo === 'ontem' ? 'ds-btn-filtro-ativo' : 'ds-btn-filtro-inativo'}`} 
                        onClick={selecionarOntem}
                    >
                        Ontem
                    </button>
                    
                    <input type="date" className="ds-input" style={{width:'auto', padding:'5px'}} value={dataEspecifica} onChange={selecionarEspecifico}/>
                </div>
            </div>

            {/* Totalizadores */}
            <div className="ds-totalizadores-container" style={{display:'flex', justifyContent:'space-around', backgroundColor:'#f8f9fa', padding:'15px', borderRadius:'12px', marginBottom:'20px', border:'1px solid #dee2e6'}}>
                <div style={{textAlign:'center'}}>
                    <span style={{display:'block', fontSize:'0.85rem', color:'#666', fontWeight:'600'}}>Total Processos</span>
                    <strong style={{fontSize:'1.4rem', color:'var(--ds-cor-primaria)'}}>{totalQtd}</strong>
                </div>
                <div style={{textAlign:'center'}}>
                    <span style={{display:'block', fontSize:'0.85rem', color:'#666', fontWeight:'600'}}>Total Pontos</span>
                    <strong style={{fontSize:'1.4rem', color:'var(--ds-cor-sucesso)'}}>{Math.round(totalPontos)}</strong>
                </div>
            </div>

            {/* Lista */}
            <div className="ds-atividades-wrapper">
                <ul className="ds-atividades-lista">
                    {itensPagina.length === 0 ? (
                        <li className="ds-item-vazio" style={{textAlign:'center', padding:'30px', color:'#999', fontStyle:'italic'}}>
                            Nenhuma atividade encontrada.
                        </li>
                    ) : (
                        itensPagina.map((item, index) => {
                            const key = item.id_original || index;
                            // PADRONIZAÇÃO: Sempre mostra "OP {numero}"
                            // Independente se veio de produção ou arremate, o número de referência é a OP.
                            const tituloTipo = `OP ${item.op_numero}`;
                            const variacao = item.variacao || '';

                            return (
                                <div key={key} className="ds-atividade-item" style={{
                                    backgroundColor:'#fff', 
                                    border:'1px solid #eee', 
                                    borderRadius:'8px', 
                                    padding:'15px', 
                                    marginBottom:'10px',
                                    display:'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                                    gap: '10px'
                                }}>
                                    <div style={{gridColumn: '1 / -1'}}>
                                        <small style={{display:'block', color:'#999', fontSize:'0.75rem', fontWeight:'bold'}}>PRODUTO</small>
                                        <span style={{fontWeight:'600', color:'#333'}}>
                                            {item.produto} 
                                            {variacao && <span style={{color: '#555', marginLeft: '5px'}}>[{variacao}]</span>}
                                        </span>
                                    </div>
                                    <div><small style={{display:'block', color:'#999', fontSize:'0.75rem', fontWeight:'bold'}}>TIPO/PROCESSO</small><span>{tituloTipo} - {item.processo}</span></div>
                                    <div><small style={{display:'block', color:'#999', fontSize:'0.75rem', fontWeight:'bold'}}>DATA</small><span>{fmtData(item.data)}</span></div>
                                    <div><small style={{display:'block', color:'#999', fontSize:'0.75rem', fontWeight:'bold'}}>HORA</small><span>{fmtHora(item.data)}</span></div>
                                    <div><small style={{display:'block', color:'#999', fontSize:'0.75rem', fontWeight:'bold'}}>QUANTIDADE</small><strong style={{fontSize:'1.1rem'}}>{item.quantidade}</strong></div>
                                    <div><small style={{display:'block', color:'#999', fontSize:'0.75rem', fontWeight:'bold'}}>PONTOS</small><strong style={{color:'var(--ds-cor-primaria)', fontSize:'1.1rem'}}>{parseFloat(item.pontos_gerados).toFixed(2)}</strong></div>
                                </div>
                            );
                        })
                    )}
                </ul>
            </div>

            {/* Paginação */}
            {totalPaginas > 1 && (
                <div className="ds-paginacao" style={{display:'flex', justifyContent:'center', alignItems:'center', gap:'15px', marginTop:'20px'}}>
                    <button className="ds-btn ds-btn-outline-primario" disabled={paginaAtual === 1} onClick={() => setPaginaAtual(p => p - 1)}>Anterior</button>
                    <span style={{fontWeight:'bold', color:'var(--ds-cor-primaria)'}}>Pág. {paginaAtual} de {totalPaginas}</span>
                    <button className="ds-btn ds-btn-outline-primario" disabled={paginaAtual === totalPaginas} onClick={() => setPaginaAtual(p => p + 1)}>Próximo</button>
                </div>
            )}
        </section>
    );
}