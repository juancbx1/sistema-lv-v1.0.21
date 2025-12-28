// public/src/components/BotaoBuscaModalAddDemanda.jsx
import React, { useState, useEffect, useMemo, useRef  } from 'react';
import { mostrarMensagem } from '/js/utils/popups.js';
import { renderizarPaginacao } from '/js/utils/Paginacao.js';

// Este é o componente que mostra a lista de produtos encontrados na busca
const ListaResultadosBusca = ({ resultados, onSelecionar, paginacaoInfo, onPageChange }) => { // <-- MODIFIQUE
    const paginacaoRef = useRef(null); // <-- ADICIONE

    // Adicione este useEffect dentro de ListaResultadosBusca
    useEffect(() => {
        if (paginacaoRef.current && paginacaoInfo && paginacaoInfo.totalPages > 1) {
            renderizarPaginacao(paginacaoRef.current, paginacaoInfo.totalPages, paginacaoInfo.currentPage, onPageChange);
        } else if (paginacaoRef.current) {
            paginacaoRef.current.innerHTML = '';
        }
    }, [paginacaoInfo, onPageChange]);

    return (
        <div className="gs-busca-lista-resultados" style={{ marginTop: 0 }}>
            {resultados.map(item => (
            <div className="gs-busca-item-resultado" key={item.sku} onClick={() => onSelecionar(item)}>
                <img src={item.imagem || '/img/placeholder-image.png'} alt={item.nome} />
                <div className="info">
                    <span className="nome">{item.nome}</span>
                    <span className="variante">{item.variante}</span>
                    <span className="sku-principal" style={{fontSize: '0.8rem'}}>SKU: {item.sku}</span>
                </div>
                <i className="fas fa-plus"></i>
            </div>
        ))}
    <div ref={paginacaoRef} className="gs-paginacao-container" style={{marginTop: '20px'}}></div>
        </div>
    );
};

// Este é o formulário final, quando um produto já foi selecionado
const FormularioConfirmacao = ({ item, onConfirmar, onCancelar, carregando }) => {
    const [quantidade, setQuantidade] = useState('');
    const [observacoes, setObservacoes] = useState('');
    const [isPrioridade, setIsPrioridade] = useState(false);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (parseInt(quantidade) > 0) {
            onConfirmar({
                produto_sku: item.sku,
                quantidade_solicitada: parseInt(quantidade),
                observacoes: observacoes,
                prioridade: isPrioridade ? 1 : 2 //ESSENCIAL
            });
        }
    };

    return (
        <form onSubmit={handleSubmit}>
            <div className="gs-radar-funil-identificacao">
                <img src={item.imagem || '/img/placeholder-image.png'} alt={item.nome} className="gs-radar-funil-imagem" />
                <div className="gs-radar-funil-info">
                    <h4>{item.nome}</h4>
                    <span className="variante-principal">{item.variante}</span>
                </div>
            </div>
            
            <label htmlFor="quantidade_solicitada" style={{fontWeight: 600, marginTop: '20px', display: 'block'}}>Quantidade Necessária</label>
            <input
                id="quantidade_solicitada"
                type="number"
                className="gs-input"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                placeholder="Ex: 50"
                min="1"
                required
                autoFocus
            />

            <label htmlFor="observacoes_demanda" style={{fontWeight: 600, marginTop: '15px', display: 'block'}}>Observações (Opcional)</label>
            <textarea
                id="observacoes_demanda"
                className="gs-textarea"
                rows="3"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Ex: Pedido urgente para a Shopee, cliente XPTO."
            ></textarea>

            {/* CHECKBOX DE PRIORIDADE */}
            <div style={{ marginTop: '20px', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', backgroundColor: '#fff9db', borderRadius: '6px', border: '1px solid #ffe066' }}>
                <input 
                    type="checkbox" 
                    id="chk_prioridade" 
                    style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                    checked={isPrioridade}
                    onChange={(e) => setIsPrioridade(e.target.checked)}
                />
                <label htmlFor="chk_prioridade" style={{ cursor: 'pointer', color: '#856404', fontWeight: 'bold' }}>
                    Marcar como PRIORIDADE (Fura-Fila)
                </label>
            </div>
            
            <div className="gs-form-acoes" style={{marginTop: '25px', textAlign: 'right'}}>
                <button type="button" className="gs-btn gs-btn-secundario" onClick={onCancelar}>Cancelar</button>
                <button type="submit" className="gs-btn gs-btn-primario" style={{marginLeft: '10px'}} disabled={carregando}>
                    {carregando ? <div className="spinner-btn-interno"></div> : 'Criar Demanda'}
                </button>
            </div>
        </form>
    );
};


// --- COMPONENTE PRINCIPAL DO MODAL ---
export default function ModalAdicionarDemanda({ onClose, onDemandaCriada }) {
    const [termoBusca, setTermoBusca] = useState('');
    const [resultados, setResultados] = useState([]);
    const [carregando, setCarregando] = useState(false);
    const [itemSelecionado, setItemSelecionado] = useState(null);

    const [paginaAtual, setPaginaAtual] = useState(1);
    const [paginacaoInfo, setPaginacaoInfo] = useState(null);

    // Função para buscar produtos na API (reaproveitando a API do radar)
    const buscarProdutos = async (termo, page = 1) => {
        if (termo.trim().length < 2) {
            setResultados([]);
            setPaginacaoInfo(null);
            return;
        }
       
        setCarregando(true);
        try {
            const token = localStorage.getItem('token');
            const url = `/api/radar-producao/buscar?termo=${encodeURIComponent(termo)}&page=${page}&limit=5`; // Limite de 5 por página
            const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await response.json();
            setResultados(data.rows || []);
            setPaginacaoInfo(data.pagination || null); // Salva as infos da paginação
        } catch (error) { /* ... */ } 
        finally { setCarregando(false); }
    };

    // Função para criar a demanda na nossa nova API
    const handleCriarDemanda = async (dadosDemanda) => {
        setCarregando(true);
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/demandas', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(dadosDemanda)
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Não foi possível criar a demanda.');
            }
            
            mostrarMensagem('Demanda criada com sucesso!', 'sucesso');
            onDemandaCriada(); // Avisa o painel para se atualizar
            onClose(); // Fecha o modal

        } catch (error) {
            mostrarMensagem(error.message, 'erro');
        } finally {
            setCarregando(false);
        }
    };

     useEffect(() => {
            // Se já houver um termo buscado, refaz a busca ao mudar de página
            if (termoBusca.trim().length >= 2) {
                buscarProdutos(termoBusca, paginaAtual);
            }
        }, [paginaAtual]); // Roda sempre que 'paginaAtual' mudar
    
    return (
        <div className="gs-busca-modal-overlay" onClick={onClose}>
            <div className="gs-busca-modal-conteudo" onClick={(e) => e.stopPropagation()} style={{maxWidth: '600px'}}>
                <div className="gs-busca-modal-header">
                    <h3>Adicionar Nova Demanda</h3>
                    <button onClick={onClose} className="gs-busca-modal-fechar">&times;</button>
                </div>
                <div className="gs-busca-modal-body">
                    {!itemSelecionado ? (
                        <>
                            <input
                                type="text"
                                className="gs-input"
                                placeholder="Digite o nome, cor ou SKU do produto..."
                                value={termoBusca}
                                onChange={(e) => {
                                    setTermoBusca(e.target.value);
                                    setPaginaAtual(1); // Reseta para a página 1 a cada nova digitação
                                    buscarProdutos(e.target.value, 1);
                                }}
                                autoFocus
                            />
                            {carregando && <div className="spinner" style={{marginTop: '20px'}}>Buscando...</div>}
                            <ListaResultadosBusca 
                                resultados={resultados} 
                                onSelecionar={setItemSelecionado}
                                paginacaoInfo={paginacaoInfo}
                                onPageChange={setPaginaAtual}
                            />
                        </>
                    ) : (
                        <FormularioConfirmacao
                            item={itemSelecionado}
                            onConfirmar={handleCriarDemanda}
                            onCancelar={() => setItemSelecionado(null)}
                            carregando={carregando}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}