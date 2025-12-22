import React, { useState, useEffect, useCallback } from 'react';
import { fetchAPI } from '/js/utils/api-utils';

export default function DashAtividadesLista({ aoAtualizar }) {
    const [filtroPeriodo, setFiltroPeriodo] = useState('hoje');
    const [dataEspecifica, setDataEspecifica] = useState(''); 
    
    // Estados de Busca
    const [termoInput, setTermoInput] = useState(''); // Valor visual do input
    const [termoBusca, setTermoBusca] = useState(''); // Valor efetivo para API
    
    const [paginaAtual, setPaginaAtual] = useState(1);
    
    // Dados da API
    const [listaAtividades, setListaAtividades] = useState([]);
    const [loading, setLoading] = useState(false);
    const [totalPaginas, setTotalPaginas] = useState(1);
    const [totalizadores, setTotalizadores] = useState({ qtd: 0, pontos: 0 });
    
    const ITENS_POR_PAGINA = 8;

    const getDataLocalISO = (d = new Date()) => {
        const ano = d.getFullYear();
        const mes = String(d.getMonth() + 1).padStart(2, '0');
        const dia = String(d.getDate()).padStart(2, '0');
        return `${ano}-${mes}-${dia}`;
    };

    // Inicialização
    useEffect(() => {
        setDataEspecifica(getDataLocalISO());
    }, []);

    // 1. DEBOUNCE DA BUSCA
    useEffect(() => {
        const timer = setTimeout(() => {
            setTermoBusca(termoInput);
        }, 600);
        return () => clearTimeout(timer);
    }, [termoInput]);

    // --- FUNÇÃO DE BUSCA NA API (COMBINADA) ---
    const buscarAtividades = useCallback(async () => {
        setLoading(true);
        try {
            let dataParam = '';
            
            // 1. Define a data baseada no botão selecionado
            if (filtroPeriodo === 'hoje') {
                dataParam = getDataLocalISO(new Date());
            } else if (filtroPeriodo === 'ontem') {
                const ontem = new Date();
                ontem.setDate(ontem.getDate() - 1);
                dataParam = getDataLocalISO(ontem);
            } else if (filtroPeriodo === 'especifico') {
                dataParam = dataEspecifica;
            }

            // REMOVIDO: O bloco que limpava dataParam.
            // Agora a API receberá 'data' E 'busca' ao mesmo tempo.

            const query = new URLSearchParams({
                data: dataParam,
                busca: termoBusca
            });

            const resultado = await fetchAPI(`/api/dashboard/atividades?${query.toString()}`);
            
            setListaAtividades(resultado.rows || []);
            // O backend não manda totalPages na raiz, manda pagination.totalPages.
            // Mas aqui estamos recebendo tudo (segundo a última alteração do fetchAll).
            // Ajuste conforme o retorno da sua API atual (se é paginada no back ou no front).
            
            // Se a API retorna tudo (sem paginação no backend):
            const listaCompleta = resultado.rows || [];
            setListaAtividades(listaCompleta);
            
            // Cálculos
            const qtd = listaCompleta.reduce((acc, i) => acc + (Number(i.quantidade)||0), 0);
            const pts = listaCompleta.reduce((acc, i) => acc + (Number(i.pontos_gerados)||0), 0);
            setTotalizadores({ qtd, pontos: pts });
            
            // Resetamos a página local
            setPaginaAtual(1);

        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, [filtroPeriodo, dataEspecifica, termoBusca]);

    // 3. Efeito Gatilho (Chama a busca quando filtros mudam)
    useEffect(() => {
        setPaginaAtual(1); // Reseta página ao filtrar
        buscarAtividades();
    }, [buscarAtividades]); 

    // --- Renderização da Lista Paginada ---
    const indiceInicial = (paginaAtual - 1) * ITENS_POR_PAGINA;
    const itensParaExibir = listaAtividades.slice(indiceInicial, indiceInicial + ITENS_POR_PAGINA);

    // Controles
    const selecionarHoje = () => { setFiltroPeriodo('hoje'); setDataEspecifica(getDataLocalISO()); setTermoInput(''); };
    const selecionarOntem = () => { setFiltroPeriodo('ontem'); const d=new Date(); d.setDate(d.getDate()-1); setDataEspecifica(getDataLocalISO(d)); setTermoInput(''); };
    const selecionarEspecifico = (e) => { setDataEspecifica(e.target.value); setFiltroPeriodo('especifico'); setTermoInput(''); };
    const fmtData = (iso) => new Date(iso).toLocaleDateString('pt-BR');
    const fmtHora = (iso) => new Date(iso).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});

    return (
        <section className="ds-card ds-painel-detalhamento">
            <h2 className="ds-card-titulo">Detalhamento das Atividades</h2>
            
            <div className="ds-controles-detalhamento" style={{marginBottom:'20px'}}>
                <div style={{display:'flex', gap:'10px', marginBottom:'10px'}}>
                    <input 
                        type="text" 
                        className="ds-input" 
                        placeholder="Buscar OP ou Produto..." 
                        value={termoInput} // Liga ao estado visual
                        onChange={(e) => setTermoInput(e.target.value)}
                        style={{flexGrow:1}}
                    />
                    <button className="ds-btn ds-btn-outline-primario" onClick={buscarAtividades} title="Recarregar">
                        <i className={`fas fa-sync-alt ${loading ? 'fa-spin' : ''}`}></i>
                    </button>
                </div>
                 <div className="ds-filtros-ativos-container" style={{display:'flex', gap:'10px', alignItems:'center', flexWrap:'wrap'}}>
                    <span style={{fontWeight:'600', fontSize:'0.9rem', color:'#666'}}>Período:</span>
                    <button className={`ds-btn ds-btn-pequeno ${filtroPeriodo === 'hoje' ? 'ds-btn-primario' : 'ds-btn-outline-primario'}`} onClick={selecionarHoje}>Hoje</button>
                    <button className={`ds-btn ds-btn-pequeno ${filtroPeriodo === 'ontem' ? 'ds-btn-primario' : 'ds-btn-outline-primario'}`} onClick={selecionarOntem}>Ontem</button>
                    <input type="date" className="ds-input" style={{width:'auto', padding:'5px'}} value={dataEspecifica} onChange={selecionarEspecifico}/>
                </div>
            </div>

            <div className="ds-totalizadores-container" style={{display:'flex', justifyContent:'space-around', backgroundColor:'#f8f9fa', padding:'15px', borderRadius:'12px', marginBottom:'20px', border:'1px solid #dee2e6'}}>
                <div style={{textAlign:'center'}}>
                    <span style={{display:'block', fontSize:'0.85rem', color:'#666', fontWeight:'600'}}>Total Processos</span>
                    <strong style={{fontSize:'1.4rem', color:'var(--ds-cor-primaria)'}}>{totalizadores.qtd}</strong>
                </div>
                <div style={{textAlign:'center'}}>
                    <span style={{display:'block', fontSize:'0.85rem', color:'#666', fontWeight:'600'}}>Total Pontos</span>
                    <strong style={{fontSize:'1.4rem', color:'var(--ds-cor-sucesso)'}}>{Math.round(totalizadores.pontos)}</strong>
                </div>
            </div>

            <div className="ds-atividades-wrapper">
                {loading ? <div className="ds-spinner" style={{margin:'40px auto'}}></div> : (
                    <ul className="ds-atividades-lista">
                        {listaAtividades.length === 0 ? (
                            <li className="ds-item-vazio" style={{textAlign:'center', padding:'30px', color:'#999', fontStyle:'italic'}}>
                                Nenhuma atividade encontrada.
                            </li>
                        ) : (
                            itensParaExibir.map((item, index) => {
                                const key = item.id_original || index;
                                const tituloTipo = `OP ${item.op_numero}`; // Padronizado
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
                                                {item.nome_produto} 
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
                )}
            </div>

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