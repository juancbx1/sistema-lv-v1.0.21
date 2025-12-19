import React, { useState, useEffect } from 'react';
import DashHeader from './components/DashHeader';
import DashPontosAnel from './components/DashPontosAnel';
import DashMetaSlider from './components/DashMetaSlider';
import DashAtividadesLista from './components/DashAtividadesLista';
import DashCicloResumo from './components/DashCicloResumo';
import DashDesempenhoModal from './components/DashDesempenhoModal';
import { fetchAPI } from '/js/utils/api-utils';
import { verificarAutenticacao } from '/js/utils/auth.js'; 
import DashSaldoCard from './components/DashSaldoCard';
import { getDataPagamentoEstimada } from '/js/utils/periodos-fiscais.js';
import DashCofreModal from './components/DashCofreModal';
import DashPerfilModal from './components/DashPerfilModal';

export default function MainDashboard() {
    const [loading, setLoading] = useState(true);
    const [dados, setDados] = useState(null);
    const [metaDoUsuario, setMetaDoUsuario] = useState(null);
    const [modalDesempenhoAberto, setModalDesempenhoAberto] = useState(false);
    const [modalCofreAberto, setModalCofreAberto] = useState(false);
    const [modalPerfilAberto, setModalPerfilAberto] = useState(false);

    const carregar = async () => {
        const auth = await verificarAutenticacao('dashboard/dashboard.html', ['acesso-dashboard']);
        if (!auth) return;

        try {
            const resultado = await fetchAPI('/api/dashboard/desempenho');
            setDados(resultado);
            
            // --- LÓGICA DE PERSISTÊNCIA DA META ---
            const metaSalvaPontos = localStorage.getItem('meta_diaria_planejada');
            
            // Tenta achar a meta salva na lista de metas possíveis
            let metaInicial = null;
            if (metaSalvaPontos && resultado.metasPossiveis) {
                metaInicial = resultado.metasPossiveis.find(m => m.pontos_meta.toString() === metaSalvaPontos);
            }

            // Se não tiver salva (ou não existir mais), usa a sugestão da API (proximaMeta) ou a primeira
            if (!metaInicial) {
                metaInicial = resultado.hoje.proximaMeta || resultado.metasPossiveis[0];
            }

            setMetaDoUsuario(metaInicial);
            // --------------------------------------

        } catch (error) {
            console.error("Erro ao carregar dashboard:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        carregar();
    }, []);

    if (loading) {
        return (
            <div className="ds-spinner-container" style={{height: '100vh'}}>
                <div className="ds-spinner"></div>
            </div>
        );
    }

    if (!dados) return <div style={{textAlign:'center', padding:'20px'}}>Erro ao carregar dados.</div>;

    // Objeto auxiliar (pode por fora do return)
    const dataPagamento = dados ? getDataPagamentoEstimada(dados.acumulado.blocos[dados.acumulado.blocos.length - 1].fim) : '--/--/----';

    return (
        <div className="ds-body autenticado">
            <DashHeader 
                usuario={dados.usuario}
                saldoCofre={dados.cofre?.saldo} // Passa o saldo para o header
                aoAbrirCofre={() => setModalCofreAberto(true)} // Abre o modal
                // Botão do gráfico abre o mesmo modal de detalhes
                aoAbrirDesempenho={() => setModalDesempenhoAberto(true)}
                aoAbrirPerfil={() => setModalPerfilAberto(true)}
                aoSair={() => { localStorage.removeItem('token'); window.location.href = '/index.html'; }}
            />

            <main className="ds-container-principal">
                {/* NOVO BLOCO DE SALDO */}
                {dados && (
                    <DashSaldoCard 
                        valorAcumulado={dados.acumulado.totalGanho} 
                        dataPagamento={dataPagamento} 
                    />
                )}
                
                {/* Painel Superior */}
                <section className="ds-painel-desempenho">
                    {/* COLUNA ESQUERDA: HOJE + REALIDADE */}
                    <div style={{flex: 1, minWidth: '300px', display: 'flex', flexDirection: 'column'}}>
                        <DashPontosAnel 
                            dadosHoje={dados.hoje} 
                            metaDinamica={metaDoUsuario} 
                        />

                        {/* COLUNA DIREITA: SONHO (Slider) */}
                        <div style={{flex: 1.5, minWidth: '300px'}}>
                            <DashMetaSlider 
                                metasPossiveis={dados.metasPossiveis} 
                                aoMudarMeta={setMetaDoUsuario} 
                                metaInicial={metaDoUsuario}
                            />
                            {/* Você pode colocar dicas ou avisos aqui embaixo do slider se quiser */}
                        </div>
                        
                        
                        {/* NOVO BLOCO: Realidade do Ciclo */}
                        <DashCicloResumo 
                            blocos={dados.acumulado.blocos}
                            acumuladoTotal={dados.acumulado.totalGanho}
                            aoClicarDetalhes={() => setModalDesempenhoAberto(true)}
                        />
                    </div>
                    
                    
                </section>

                {/* Lista de Atividades */}
                <DashAtividadesLista 
                    atividades={dados.atividadesRecentes} 
                    aoAtualizar={carregar} 
                />

            </main>

            {/* Modal de Detalhes (Abre ao clicar no botão "Ver Detalhes" do resumo) */}
            {modalDesempenhoAberto && (
                <DashDesempenhoModal 
                    dadosAcumulados={dados.acumulado}
                    onClose={() => setModalDesempenhoAberto(false)}
                />
            )}

            {modalCofreAberto && (
                <DashCofreModal 
                    dadosCofre={dados.cofre}
                    metaDoDia={metaDoUsuario}
                    pontosHoje={dados.hoje.pontos}
                    // NOVA PROP: Envia a primeira meta (Bronze) para cálculo da trava
                    metaMinima={dados.metasPossiveis ? dados.metasPossiveis[0] : null}
                    aoResgatarSucesso={carregar}
                    onClose={() => setModalCofreAberto(false)}
                />
            )}

            {/* NOVO MODAL DE PERFIL */}
            {modalPerfilAberto && (
                <DashPerfilModal 
                    usuarioAtual={dados.usuario}
                    onClose={() => setModalPerfilAberto(false)}
                    aoAtualizarAvatar={carregar} // Recarrega os dados do usuário para atualizar o header
                />
            )}

        </div>
    );
}