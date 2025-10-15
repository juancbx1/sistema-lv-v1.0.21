// public/src/components/RadarProduto.jsx
import React, { useState, useEffect } from 'react';
import { mostrarMensagem } from '/js/utils/popups.js'

// --- Dados Mockados (de mentirinha) ---
const mockItensZeradosInicial = [
    { id: 1, nome: "Touca de Cetim (Dupla Face)", variacao: "Marsala com Preto | G", imagem: "https://ock3xwuhzid9sows.public.blob.vercel-storage.com/touca_cetim_df_marsala_preto1.jpg" },
    { id: 2, nome: "Fronha de Cetim", variacao: "Preto", imagem: "https://ock3xwuhzid9sows.public.blob.vercel-storage.com/fronha_preto.jpg" },
    { id: 3, nome: "Scrunchie (Fina)", variacao: "Rosé", imagem: "https://ock3xwuhzid9sows.public.blob.vercel-storage.com/scrunchie-fina-unidade-un.jpg" },
];

const mockResultadoBusca = {
    nome: "Touca de Cetim (Dupla Face) - Marsala com Preto | G",
    naEmbalagem: { qtd: 1, info: "Aguardando há 1 dia" },
    noArremate: { qtd: 2, info: "Lote mais antigo: 2 dias" },
    emEstoque: { qtd: 0, info: "Estoque Zerado!" }, // Ajustado para refletir o alerta
};
// --- Fim dos Dados Mockados ---

// Sub-componente para os cards de resultado (não muda)
const CardResultado = ({ icone, titulo, dados }) => (
    <div className="gs-radar-card-resultado">
        <h5 className="gs-radar-card-titulo"><i className={`fas ${icone}`}></i> {titulo}</h5>
        <div className="gs-radar-card-metrica">{dados.qtd} pçs</div>
        <div className="gs-radar-card-info" style={{ color: dados.qtd === 0 ? 'var(--gs-perigo)' : '' }}>{dados.info}</div>
        <button className="gs-radar-card-botao" onClick={() => mostrarMensagem(
        'Esta funcionalidade ainda está em desenvolvimento e será implementada em breve!',
        'aviso' // tipo 'aviso' (laranja) que combina com "em desenvolvimento"
      )}
    >
        Ver Detalhes
    </button>
    </div>
);

// --- Novo Sub-componente para o Item da Lista Crítica ---
const ItemCritico = ({ item, onConsultar, onDispensar }) => (
    <div className="gs-radar-item-critico">
        <img src={item.imagem} alt={item.nome} className="gs-radar-item-imagem" />
        <div className="gs-radar-item-info">
            <div className="nome-produto">{item.nome}</div>
            <div className="nome-variacao">{item.variacao}</div>
        </div>
        <div className="gs-radar-lista-acoes">
            <button title="Consultar Funil" onClick={() => onConsultar(item)}>
                <i className="fas fa-search"></i>
            </button>
            <button title="Marcar como resolvido" onClick={() => onDispensar(item.id)}>
                <i className="fas fa-check"></i>
            </button>
        </div>
    </div>
);

export default function RadarProduto() {
    const [expandido, setExpandido] = useState(false);
    const [termoBusca, setTermoBusca] = useState('');
    const [modo, setModo] = useState('alerta');
    const [itemConsultado, setItemConsultado] = useState(null);

    // Estado para a lista de itens, que agora pode ser modificada
    const [itensZerados, setItensZerados] = useState(mockItensZeradosInicial);

    // Efeito para resetar para o modo busca se a lista de alertas ficar vazia
    useEffect(() => {
        if (itensZerados.length === 0 && modo !== 'busca') {
            setModo('busca');
            setExpandido(false);
        }
    }, [itensZerados, modo]);

    const handleToggleExpandir = () => {
        const novoEstadoExpandido = !expandido;
        setExpandido(novoEstadoExpandido);

        if (novoEstadoExpandido && modo === 'alerta' && itensZerados.length > 0) {
            setModo('lista_alertas');
        } else if (!novoEstadoExpandido) {
            setModo(itensZerados.length > 0 ? 'alerta' : 'busca');
            setItemConsultado(null);
            setTermoBusca('');
        }
    };

    const handleVerLista = (e) => {
        e.stopPropagation();
        setModo('lista_alertas');
        if (!expandido) setExpandido(true);
    };

    const handleConsultarFunil = (item) => {
        setItemConsultado(item);
        setModo('resultado_busca');
    };

    const handleVoltarParaLista = () => {
        setItemConsultado(null);
        setModo('lista_alertas');
    };
    
    // Função para dispensar um item da lista de alertas
    const handleDispensarItem = (itemId) => {
        setItensZerados(prevItens => prevItens.filter(item => item.id !== itemId));
    };

    const handleBuscaSubmit = (e) => {
        e.preventDefault();
        if (termoBusca.trim() === '') return;
        setModo('resultado_busca');
        setItemConsultado(null);
        if (!expandido) setExpandido(true);
    };
    
    const renderConteudoInterno = () => {
        switch (modo) {
            case 'lista_alertas':
                return (
                    <div className="gs-radar-conteudo-lista">
                        <h4>Lista de Itens Críticos:</h4>
                        <div className="gs-radar-lista-critica">
                            {itensZerados.map(item => (
                                <ItemCritico 
                                    key={item.id}
                                    item={item}
                                    onConsultar={handleConsultarFunil}
                                    onDispensar={handleDispensarItem}
                                />
                            ))}
                        </div>
                    </div>
                );

            case 'resultado_busca':
                const tituloResultado = itemConsultado ? itemConsultado.nome : `Resultado para: "${termoBusca}"`;
                const mostrarBotaoVoltar = itemConsultado !== null;
                return (
                    <div className="gs-radar-conteudo-funil">
                        <div className="gs-radar-funil-header">
                            {mostrarBotaoVoltar && (
                                <button onClick={handleVoltarParaLista} className="gs-radar-botao-voltar">
                                    <i className="fas fa-arrow-left"></i> Voltar
                                </button>
                            )}
                            <h4>{tituloResultado}</h4>
                        </div>
                        <div className="gs-radar-cards-container">
                            <CardResultado icone="fa-box-open" titulo="Na Embalagem" dados={mockResultadoBusca.naEmbalagem} />
                            <CardResultado icone="fa-cut" titulo="No Arremate" dados={mockResultadoBusca.noArremate} />
                            <CardResultado icone="fa-check-circle" titulo="Em Estoque" dados={mockResultadoBusca.emEstoque} />
                        </div>
                    </div>
                );
            
            default:
                return null;
        }
    };

    return (
        <div className={`gs-radar-container ${expandido ? 'expandido' : ''}`}>
            {/* O Header agora não tem mais o onClick principal */}
            <div className="gs-radar-header">
                {itensZerados.length > 0 ? (
                    <div className="gs-radar-header-alerta">
                        <span className="alerta-titulo">🔥 ALERTA DE ESTOQUE:</span>
                        <span className="alerta-mensagem">{itensZerados.length} produto(s) com estoque zerado!</span>
                        <button className="gs-radar-botao-ver" onClick={handleVerLista}>Ver Lista</button>
                    </div>
                ) : (
                    <div className="gs-radar-header-busca">
                        <label>Radar de Produto:</label>
                        <form onSubmit={handleBuscaSubmit}>
                            <input type="text" placeholder="Buscar por nome, variação ou SKU..." value={termoBusca} onChange={(e) => setTermoBusca(e.target.value)} onClick={(e) => e.stopPropagation()} />
                        </form>
                    </div>
                )}
            </div>

             {expandido && (
                <div className="gs-radar-conteudo">
                    {renderConteudoInterno()}
                </div>
            )}

            {/* O NOVO PUXADOR, que agora controla a expansão */}
            <div className="gs-radar-puxador" onClick={handleToggleExpandir}>
                <i className="fas fa-chevron-down gs-radar-seta-baixo"></i>
                <i className="fas fa-chevron-up gs-radar-seta-cima"></i>
            </div>
        </div>
    );
}