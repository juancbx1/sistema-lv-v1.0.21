// public/src/components/OPStatusCard.jsx

import React, { useState } from 'react';

const getStatusInfo = (status) => {
    // Tratamento especial para LIVRE_MANUAL
    if (status === 'LIVRE_MANUAL') {
        return { texto: 'Livre', classe: 'status-livre' };
    }

    const statusMap = {
        PRODUZINDO: { texto: 'Produzindo', classe: 'status-produzindo' },
        LIVRE: { texto: 'Livre', classe: 'status-livre' },
        PAUSA: { texto: 'Em Pausa', classe: 'status-pausa' },
        ALMOCO: { texto: 'Almoço', classe: 'status-almoco' },
        FORA_DO_HORARIO: { texto: 'Fora do Horário', classe: 'status-fora-horario' },
        PAUSA_MANUAL: { texto: 'Pausa Manual', classe: 'status-pausa-manual' },
        FALTOU: { texto: 'Faltou', classe: 'status-faltou' },
        ALOCADO_EXTERNO: { texto: 'Outro Setor', classe: 'status-alocado-externo' },
    };
    return statusMap[status] || { texto: status || 'Indefinido', classe: 'status-indefinido' };
};

export default function OPStatusCard({ funcionario, tpp, onAtribuirTarefa, onAcaoManual, onFinalizarTarefa, onCancelarTarefa }) {
    const [menuAberto, setMenuAberto] = useState(false);

    if (!funcionario) return null;

    const { status_atual, nome, avatar_url, tarefa_atual } = funcionario;
    const { texto: statusTexto, classe: statusClasse } = getStatusInfo(status_atual);

    const tarefaSegura = tarefa_atual || {};

    const handleAcaoClick = (acao) => {
        if (onAcaoManual) {
            onAcaoManual(funcionario, acao);
        }
        setMenuAberto(false);
    };

    // --- LÓGICA DO MENU DE AÇÕES MANUAL ---
    const getMenuItems = () => {
        switch (status_atual) {
            case 'LIVRE':
            case 'LIVRE_MANUAL': // <--- ADICIONADO AQUI
            case 'PRODUZINDO':
                return [
                    { acao: 'PAUSA_MANUAL', label: 'Iniciar Pausa', icon: 'fa-coffee' },
                    { acao: 'FALTOU', label: 'Marcar Falta', icon: 'fa-user-slash' },
                    { acao: 'ALOCADO_EXTERNO', label: 'Alocar em Outro Setor', icon: 'fa-shipping-fast' },
                ];
            
            case 'PAUSA_MANUAL':
            case 'PAUSA':
            case 'ALMOCO':
            case 'FORA_DO_HORARIO':
            case 'FALTOU':
            case 'ALOCADO_EXTERNO':
                return [
                    { acao: 'LIVRE_MANUAL', label: 'Liberar para Trabalho (Voltou)', icon: 'fa-play' }
                ];
            
            default:
                return [];
        }
    };

    const menuItems = getMenuItems();

    const renderConteudoCard = () => {
        if (status_atual === 'PRODUZINDO' && tarefa_atual) {
            return (
                <>
                    <div className="info-tarefa-redesenhada">
                        <div className="quantidade-tarefa-destaque">
                            {tarefaSegura.quantidade}<small>pçs</small>
                        </div>
                        <div className="produto-tarefa-subtitulo">
                            {tarefaSegura.produto_nome} ({tarefaSegura.variante || 'Padrão'})
                        </div>
                        <strong style={{marginTop: '5px', color: 'var(--op-cor-azul-claro)'}}>
                            {tarefaSegura.processo}
                        </strong>
                        
                        <div className="metricas-tarefa-container">
                            <div className="cronometro-tarefa"><i className="fas fa-clock"></i> --:--:--</div>
                            <div className="indicador-ritmo-tarefa">--</div>
                            <div className="barra-progresso-container" title="Estimativa">
                                <div className="barra-progresso" style={{ width: '0%' }}></div>
                            </div>
                        </div>
                    </div>
                    <div className="card-status-footer">
                        <div className="oa-card-botoes-acao-container">
                            <button className="btn-acao cancelar" onClick={() => onCancelarTarefa(funcionario)}>
                                <i className="fas fa-times"></i> Cancelar
                            </button>
                            <button className="btn-acao finalizar" onClick={() => onFinalizarTarefa(funcionario)}>
                                <i className="fas fa-check-double"></i> Finalizar
                            </button>
                        </div>
                    </div>
                </>
            );
        } else {
            return (
                <>
                    <div className="status-carimbo-container">
                        <div className="status-carimbo">{statusTexto}</div>
                    </div>
                    <div className="card-status-footer">
                        {status_atual === 'LIVRE' && (
                             <div className="oa-card-botoes-acao-container">
                                <button 
                                    className="btn-acao finalizar"
                                    onClick={() => onAtribuirTarefa(funcionario)}
                                >
                                    <i className="fas fa-play"></i> Atribuir Tarefa
                                </button>
                            </div>
                        )}
                        {/* Se estiver em ALMOCO ou PAUSA, o rodapé fica vazio, 
                            mas o botão de menu (três pontinhos) lá em cima permite liberar */}
                    </div>
                </>
            );
        }
    };

    return (
        <div 
            className={`oa-card-status-tiktik ${statusClasse}`} 
            data-funcionario-id={funcionario.id}
            data-inicio={tarefaSegura.data_inicio || ''} 
            data-tpp={tpp || 0}
            data-quantidade={tarefaSegura.quantidade || 0}
        >
            <div className="card-status-header">
                <div className="avatar-tiktik" style={{ backgroundImage: `url('${avatar_url || '/img/placeholder-image.png'}')` }}></div>
                <div className="info-empregado">
                    <span className="nome-tiktik">{nome}</span>
                    <span className={`status-selo ${statusClasse}`}>{statusTexto}</span>
                </div>
                
                {/* Renderiza o menu se houver opções disponíveis */}
                {menuItems.length > 0 && (
                    <div style={{ position: 'relative' }}>
                        <button className="btn-menu-acoes" onClick={() => setMenuAberto(!menuAberto)} title="Opções de Status">
                            <i className="fas fa-ellipsis-v"></i>
                        </button>
                        {menuAberto && (
                            <div className="menu-acoes-popup visivel" style={{ right: 0 }}>
                                {menuItems.map(item => (
                                    <button key={item.acao} onClick={() => handleAcaoClick(item.acao)}>
                                        <i className={`fas ${item.icon}`}></i>
                                        <span>{item.label}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
            {renderConteudoCard()}
        </div>
    );
}