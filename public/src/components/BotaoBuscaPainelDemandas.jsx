// public/src/components/BotaoBuscaPainelDemandas.jsx

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { mostrarMensagem } from '/js/utils/popups.js';
import FeedbackNotFound from './FeedbackNotFound.jsx';
import BotaoBuscaItemDemanda from './BotaoBuscaItemDemanda.jsx';
import BotaoBuscaItemAgregado from './BotaoBuscaItemAgregado.jsx';
import BotaoBuscaModalAddDemanda from './BotaoBuscaModalAddDemanda.jsx';
import { renderizarPaginacao } from '/js/utils/Paginacao.js';



export default function PainelDemandas() {
    const [demandasPorItem, setDemandasPorItem] = useState([]); 
    const [demandasAgregadas, setDemandasAgregadas] = useState([]);
    const [visaoPainel, setVisaoPainel] = useState('demandas');
    const [carregando, setCarregando] = useState(true);
    const [modalAddAberto, setModalAddAberto] = useState(false);

    const ITENS_POR_PAGINA = 6; // Defina quantos itens por página
    const [paginaAtualDemandas, setPaginaAtualDemandas] = useState(1);
    const [paginaAtualAgregado, setPaginaAtualAgregado] = useState(1);
    const paginacaoDemandasRef = useRef(null);
    const paginacaoAgregadoRef = useRef(null);

    // --- INÍCIO DA ADIÇÃO 'useMemo' ---
    // Cria uma lista 'fatiada' apenas com os itens da página atual para a Visão por Demanda
    const itensPaginadosDemandas = useMemo(() => {
        const inicio = (paginaAtualDemandas - 1) * ITENS_POR_PAGINA;
        return demandasPorItem.slice(inicio, inicio + ITENS_POR_PAGINA);
    }, [demandasPorItem, paginaAtualDemandas]);

    // Faz o mesmo para a Visão Agregada
    const itensPaginadosAgregado = useMemo(() => {
        const inicio = (paginaAtualAgregado - 1) * ITENS_POR_PAGINA;
        return demandasAgregadas.slice(inicio, inicio + ITENS_POR_PAGINA);
    }, [demandasAgregadas, paginaAtualAgregado]);
    // --- FIM DA ADIÇÃO ---

    // --- INÍCIO DA ADIÇÃO 'useEffect' ---
    // Este efeito "observa" as mudanças e renderiza a paginação quando necessário
    useEffect(() => {
        if (visaoPainel === 'demandas' && paginacaoDemandasRef.current) {
            const totalPaginas = Math.ceil(demandasPorItem.length / ITENS_POR_PAGINA) || 1;
            renderizarPaginacao(paginacaoDemandasRef.current, totalPaginas, paginaAtualDemandas, setPaginaAtualDemandas);
        }
        if (visaoPainel === 'agregado' && paginacaoAgregadoRef.current) {
            const totalPaginas = Math.ceil(demandasAgregadas.length / ITENS_POR_PAGINA) || 1;
            renderizarPaginacao(paginacaoAgregadoRef.current, totalPaginas, paginaAtualAgregado, setPaginaAtualAgregado);
        }
    }, [demandasPorItem, demandasAgregadas, paginaAtualDemandas, paginaAtualAgregado, visaoPainel]);

    // Este efeito reseta a página para 1 sempre que o usuário muda de aba
    useEffect(() => {
        setPaginaAtualDemandas(1);
        setPaginaAtualAgregado(1);
    }, [visaoPainel]);
    // --- FIM DA ADIÇÃO ---

    // Função para buscar os dados da nossa nova API de diagnóstico
    const fetchDiagnostico = useCallback(async () => {
        setCarregando(true);
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/demandas/diagnostico-completo', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            });

            if (!response.ok) {
                throw new Error('Falha ao buscar o diagnóstico das demandas.');
            }

            const data = await response.json();

            setDemandasPorItem(data.diagnosticoPorDemanda || []);
            setDemandasAgregadas(data.diagnosticoAgregado || []);

        } catch (error) {
            console.error("Erro ao carregar diagnóstico de demandas:", error);
            mostrarMensagem(error.message, "erro");
        } finally {
            setCarregando(false);
        }
    }, []);

    // useEffect para chamar a busca de dados quando o componente for montado
    useEffect(() => {
        fetchDiagnostico();
    }, [fetchDiagnostico]);

    const handleDeleteDemanda = async (id) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/demandas/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Falha ao deletar a demanda.');
            }

            mostrarMensagem('Demanda removida!', 'sucesso');
            // Atualiza a lista no frontend removendo o item deletado,
            // para uma resposta visual instantânea.
            setDemandasPorItem(prevDemandas => prevDemandas.filter(d => d.id !== id));

        } catch (error) {
            console.error("Erro ao deletar demanda:", error);
            mostrarMensagem(error.message, "erro");
        }
    };

    const handleUpdateDemanda = async (id, data) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/demandas/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(data) // Envia os dados a serem atualizados (ex: { prioridade: 1 })
            });

            if (!response.ok) {
                throw new Error('Falha ao atualizar a prioridade.');
            }

            // Após a atualização no banco, busca a lista inteira novamente
            // para garantir que a ordem de prioridade seja refletida na tela.
            fetchDiagnostico();
            mostrarMensagem('Prioridade atualizada com sucesso!', 'sucesso');

        } catch (error) {
            console.error("Erro ao atualizar demanda:", error);
            mostrarMensagem(error.message, "erro");
        }
    };

    // Função para renderizar o conteúdo principal
    const renderizarConteudo = () => {
        if (carregando) {
            return <div className="spinner">Carregando prioridades...</div>;
        }

        if (visaoPainel === 'demandas') {
            if (demandasPorItem.length === 0) {
                return <FeedbackNotFound icon="fa-check-circle" titulo="Nenhuma Demanda Urgente" mensagem="Não há nenhuma demanda de produção pendente no momento." />;
            }
            return (
                <>
                    <div className="gs-demandas-lista">
                        {itensPaginadosDemandas.map(demanda => ( // <-- USA A LISTA 'FATIADA'
                            <BotaoBuscaItemDemanda 
                                key={demanda.id} 
                                demanda={demanda}
                                onDelete={handleDeleteDemanda}
                                onUpdate={handleUpdateDemanda}
                            />
                        ))}
                    </div>
                    {/* Container vazio que será preenchido pela sua função Paginacao.js */}
                    <div ref={paginacaoDemandasRef} className="gs-paginacao-container" style={{marginTop: '20px'}}></div>
                </>
            );
        }

        if (visaoPainel === 'agregado') {
            if (demandasAgregadas.length === 0) {
                return <FeedbackNotFound icon="fa-check-circle" titulo="Tudo em Dia!" mensagem="Não há necessidade de produção de componentes para atender às demandas atuais." />;
            }
            return (
                <>
                    <div className="gs-agregado-lista">
                        {itensPaginadosAgregado.map(item => ( // <-- USA A LISTA 'FATIADA'
                            <BotaoBuscaItemAgregado key={`${item.produto_id}|${item.variacao}`} item={item} />
                        ))}
                    </div>
                    {/* Container vazio que será preenchido pela sua função Paginacao.js */}
                    <div ref={paginacaoAgregadoRef} className="gs-paginacao-container" style={{marginTop: '20px'}}></div>
                </>
            );
        }
    };

    return (
    <>
        {/* O container principal que envolve todo o painel */}
        <div className="gs-painel-demandas-container">

            {/* O cabeçalho com o título e os botões de ação principais */}
            <div className="gs-painel-demandas-header">
                <h2>Painel de Prioridades</h2>
                <div>
                    <button 
                        className="gs-btn gs-btn-secundario" 
                        onClick={fetchDiagnostico} 
                        disabled={carregando}
                    >
                        <i className={`fas fa-sync-alt ${carregando ? 'gs-spin' : ''}`}></i>
                        Atualizar
                    </button>
                    <button 
                        className="gs-btn gs-btn-primario" 
                        style={{ marginLeft: '10px' }}
                        onClick={() => setModalAddAberto(true)}
                    >
                        <i className="fas fa-plus"></i> Adicionar Demanda
                    </button>
                </div>
            </div>

            {/* O novo switcher de abas para alternar entre as visões */}
            <div className="gs-view-switcher-interno">
                <button
                    className={`gs-btn-switch ${visaoPainel === 'demandas' ? 'ativo' : ''}`}
                    onClick={() => setVisaoPainel('demandas')}
                >
                    <i className="fas fa-list-ul"></i> Visão por Demanda
                </button>
                <button
                    className={`gs-btn-switch ${visaoPainel === 'agregado' ? 'ativo' : ''}`}
                    onClick={() => setVisaoPainel('agregado')}
                >
                    <i className="fas fa-boxes"></i> Visão Agregada
                </button>
            </div>

            {/* O corpo do painel, onde o conteúdo dinâmico (as listas) é renderizado */}
            <div className="gs-painel-demandas-body">
                {renderizarConteudo()}
            </div>
            
        </div>

        {/* Renderização condicional do modal de "Adicionar Demanda" fora do container principal */}
        {modalAddAberto && (
            <BotaoBuscaModalAddDemanda 
                onClose={() => setModalAddAberto(false)}
                onDemandaCriada={fetchDiagnostico}
            />
        )}
    </>
);
}