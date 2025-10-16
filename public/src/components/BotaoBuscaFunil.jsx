// public/src/components/BotaoBuscaFunil.jsx
import React, { useState, useEffect  } from 'react';
import FeedbackNotFound from './FeedbackNotFound.jsx';
import { mostrarMensagem } from '/js/utils/popups.js';

// Sub-componente CardResultado (copiado para ser autônomo)
const CardResultado = ({ icone, titulo, dados }) => (
    <div className="gs-radar-card-resultado">
        <h5 className="gs-radar-card-titulo"><i className={`fas ${icone}`}></i> {titulo}</h5>
        <div className="gs-radar-card-metrica">{dados.qtd} pçs</div>
        <div className="gs-radar-card-info" style={{ color: dados.qtd <= 3 ? 'var(--gs-perigo)' : '' }}>{dados.info}</div>
    </div>
);

export default function BotaoBuscaFunil() {
    const [modalAberto, setModalAberto] = useState(false);
    const [termoBusca, setTermoBusca] = useState('');
    const [resultado, setResultado] = useState(null);
    const [carregando, setCarregando] = useState(false);
    const [buscou, setBuscou] = useState(false);

    // --- NOVA FUNÇÃO DE BUSCA CENTRALIZADA ---
    const executarBusca = async (termo) => {
        if (termo.trim() === '') return;
        
        setCarregando(true);
        setBuscou(true);
        setResultado(null); // Limpa resultados antigos
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/radar-producao/funil?busca=${encodeURIComponent(termo)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                if(response.status === 404) { setResultado(null); return; }
                const err = await response.json();
                throw new Error(err.error || 'Erro na busca.');
            }
            const data = await response.json();
            setResultado(data);
        } catch (error) {
            mostrarMensagem(`Erro: ${error.message}`, 'erro');
            setResultado(null);
        } finally {
            setCarregando(false);
        }
    };

    const handleBuscaSubmit = (e) => {
        e.preventDefault();
        executarBusca(termoBusca);
    };

    // --- EFEITO PARA OUVIR O EVENTO GLOBAL ---
    useEffect(() => {
        const handleConsultaExterna = (event) => {
            const { sku } = event.detail;
            if (sku) {
                setModalAberto(true); // Abre o modal
                setTermoBusca(sku);   // Preenche o campo de busca (opcional)
                executarBusca(sku);   // Executa a busca imediatamente
            }
        };

        // Adiciona o "ouvinte"
        window.addEventListener('radar:consultarFunil', handleConsultaExterna);

        // Função de limpeza: remove o "ouvinte" quando o componente é desmontado
        return () => {
            window.removeEventListener('radar:consultarFunil', handleConsultaExterna);
        };
    }, []); // O array vazio [] garante que isso só rode uma vez

    const fecharModal = () => {
        setModalAberto(false);
        setTermoBusca('');
        setResultado(null);
        setBuscou(false);
    }

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
                    <form onSubmit={handleBuscaSubmit} className="gs-busca-wrapper" style={{display: 'flex', gap: '10px'}}>
                        <input type="text" className="gs-input" placeholder="Digite o nome, variação ou SKU..." value={termoBusca} onChange={(e) => setTermoBusca(e.target.value)} autoFocus />
                        <button type="submit" className="gs-btn gs-btn-primario" disabled={carregando}>
                            {carregando ? <div className="spinner-btn-interno"></div> : 'Buscar'}
                        </button>
                    </form>

                    <div className="gs-busca-modal-resultados">
                        {carregando ? (
                            <div className="spinner">Buscando...</div>
                        ) : resultado ? (
                            <div className="gs-radar-conteudo-funil">
                                <div className="gs-radar-funil-identificacao">
                                    <img src={resultado.produto.imagem || '/img/placeholder-image.png'} alt={resultado.produto.nome} className="gs-radar-funil-imagem" />
                                    <div className="gs-radar-funil-info">
                                        <h4>{resultado.produto.nome}</h4>
                                        <p>{resultado.produto.variante}</p>
                                    </div>
                                </div>
                                <div className="gs-radar-cards-container">
                                    <CardResultado icone="fa-cut" titulo="No Arremate" dados={resultado.funil.arremate} />
                                    <CardResultado icone="fa-box-open" titulo="Na Embalagem" dados={resultado.funil.embalagem} />
                                    <CardResultado icone="fa-check-circle" titulo="Em Estoque" dados={resultado.funil.estoque} />
                                </div>
                            </div>
                        ) : buscou ? (
                            <FeedbackNotFound icon="fa-box-open" titulo="Produto Não Encontrado" mensagem="Não encontramos nenhum produto que corresponda à sua busca. Tente outros termos." />
                        ) : (
                            <div style={{textAlign: 'center', color: 'var(--gs-texto-secundario)', marginTop: '30px'}}>Digite para consultar o funil completo de um produto.</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}