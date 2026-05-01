import React, { useState, useEffect } from 'react';
import DashHeader from './components/DashHeader';
import DashAtividadesLista from './components/DashAtividadesLista';
import DashFocoHoje from './components/DashFocoHoje';
import DashDesempenhoModal from './components/DashDesempenhoModal';
import { fetchAPI } from '/js/utils/api-utils';
import { verificarAutenticacao } from '/js/utils/auth.js'; 
import DashProjecaoCiclo from './components/DashProjecaoCiclo';
import DashRitmoIA from './components/DashRitmoIA';
import DashCofreModal from './components/DashCofreModal';
import DashPerfilModal from './components/DashPerfilModal';
import DashPagamentosModal from './components/DashPagamentosModal';
import DashRankingCard from './components/DashRankingCard';
import DashVersionFooter from './components/DashVersionFooter';

export default function MainDashboard() {
    const [loading, setLoading] = useState(true);
    const [dados, setDados] = useState(null);
    const [metaDoUsuario, setMetaDoUsuario] = useState(null);
    const [modalDesempenhoAberto, setModalDesempenhoAberto] = useState(false);
    const [modalCofreAberto, setModalCofreAberto] = useState(false);
    const [modalPerfilAberto, setModalPerfilAberto] = useState(false);
    const [modalPagamentosAberto, setModalPagamentosAberto] = useState(false);
    const [impersonandoNome, setImpersonandoNome] = useState(null);

    const carregar = async () => {
        // Detecta token de impersonação na URL e o armazena em sessionStorage (isolado por aba)
        const urlParams = new URLSearchParams(window.location.search);
        const tokenUrl = urlParams.get('impersonando');
        if (tokenUrl) {
            sessionStorage.setItem('impersonation_token', tokenUrl);
            window.history.replaceState({}, '', window.location.pathname);
        }

        const auth = await verificarAutenticacao('dashboard/dashboard.html', ['acesso-dashboard']);
        if (!auth) return;

        try {
            // Se houver token de impersonação, extrair o nome do payload (sem chamar API extra)
            const impToken = sessionStorage.getItem('impersonation_token');
            if (impToken) {
                try {
                    const payload = JSON.parse(atob(impToken.split('.')[1]));
                    if (payload.impersonando) setImpersonandoNome(payload.nome);
                } catch (_) { /* ignora erro de decode */ }
            }

            const resultado = await fetchAPI('/api/dashboard/desempenho');
            setDados(resultado);
            
            // --- LÓGICA DE PERSISTÊNCIA DA META ---
            const metaSalvaPontos = localStorage.getItem('meta_diaria_planejada');
            
            // Tenta achar a meta salva na lista de metas possíveis
            let metaInicial = null;
            if (metaSalvaPontos && resultado.metasPossiveis) {
                metaInicial = resultado.metasPossiveis.find(m => m.pontos_meta.toString() === metaSalvaPontos);
            }

            if (!metaInicial) {
                // Só usa sugestão do servidor se o usuário NUNCA escolheu nada
                if (!metaSalvaPontos) {
                    metaInicial = resultado.hoje.proximaMeta || resultado.metasPossiveis[0];
                } else {
                    // Tinha salvo mas a meta não existe mais — usa a primeira disponível
                    metaInicial = resultado.metasPossiveis[0];
                }
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

    return (
        <div className="ds-body autenticado">
            {impersonandoNome && (
                <div className="ds-impersonacao-banner">
                    <i className="fas fa-user-shield"></i>
                    <span>Modo Admin — visualizando como <strong>{impersonandoNome}</strong></span>
                    <span className="ds-impersonacao-info">Sessão de 2h · Feche a aba para encerrar</span>
                </div>
            )}
            <DashHeader
                usuario={dados.usuario}
                saldoCofre={dados.cofre?.saldo} // Passa o saldo para o header
                aoAbrirCofre={() => setModalCofreAberto(true)} // Abre o modal
                // Botão do gráfico abre o mesmo modal de detalhes
                aoAbrirDesempenho={() => setModalDesempenhoAberto(true)}
                aoAbrirPerfil={() => setModalPerfilAberto(true)}
                aoAbrirPagamentos={() => setModalPagamentosAberto(true)}
                aoSair={() => { localStorage.removeItem('token'); window.location.href = '/index.html'; }}
            />

            <main className="ds-container-principal">
                <DashProjecaoCiclo
                    valorAcumulado={dados.acumulado.totalGanho}
                    diasUteisNoCiclo={dados.acumulado.diasUteisNoCiclo}
                    diasTrabalhadosNoCiclo={dados.acumulado.diasTrabalhadosNoCiclo}
                    diasDetalhes={dados.acumulado.diasDetalhes}
                    metasPossiveis={dados.metasPossiveis}
                    metaDoUsuario={metaDoUsuario}
                    aoMudarMeta={setMetaDoUsuario}
                    inicioCiclo={dados.periodo?.inicio}
                    fimCiclo={dados.periodo?.fim}
                />
                
                <DashFocoHoje
                    dadosHoje={dados.hoje}
                    metasPossiveis={dados.metasPossiveis}
                    metaInicial={metaDoUsuario}
                    aoMudarMeta={setMetaDoUsuario}
                    diasUteisNoCiclo={dados.acumulado.diasUteisRealDoEmpregadoNoCiclo}
                />

                <DashRitmoIA metaDoUsuario={metaDoUsuario} />

                <DashRankingCard />

                {/* Lista de Atividades */}
                <DashAtividadesLista
                    atividades={dados.atividadesRecentes}
                    aoAtualizar={carregar}
                />

            </main>

            <DashVersionFooter />

            {/* Modal de Detalhes (Abre ao clicar no botão "Ver Detalhes" do resumo) */}
            {modalDesempenhoAberto && (
                <DashDesempenhoModal
                    dadosAcumulados={dados.acumulado}
                    diasTrabalho={dados.usuario?.dias_trabalho}
                    onClose={() => setModalDesempenhoAberto(false)}
                />
            )}

            {modalCofreAberto && (
                <DashCofreModal
                    dadosCofre={dados.cofre}
                    metaDoDia={metaDoUsuario}
                    pontosHoje={dados.hoje.pontos}
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

            {modalPagamentosAberto && (
                <DashPagamentosModal 
                    pagamentoPendente={dados.pagamentoPendente} // NOVA PROP
                    onClose={() => setModalPagamentosAberto(false)}
                />
            )}

        </div>
    );
}