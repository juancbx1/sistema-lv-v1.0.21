import React from 'react';
import imgDefaultAvatar from '../assets/default-avatar.png'; 

export default function DashHeader({ usuario, saldoCofre, aoAbrirDesempenho, aoAbrirCofre, aoAbrirPagamentos, aoAbrirPerfil, aoSair }) {
    // Tratamento de segurança para dados opcionais
    // Agora usamos a imagem importada como fallback
    const avatarUrl = usuario?.avatar_url || imgDefaultAvatar;
    const nomeUsuario = usuario?.nome || "Colaborador";
    const tipoUsuario = usuario?.tipo 
        ? usuario.tipo.charAt(0).toUpperCase() + usuario.tipo.slice(1) 
        : "N/A";
    const nivelUsuario = usuario?.nivel || "?";

    return (
        <header className="ds-header-principal">
            <div className="ds-identidade-bloco">
                <div className="ds-identidade-avatar">
                    <img src={avatarUrl} alt="Avatar do colaborador" id="header-avatar-img" />
                    <span className="ds-identidade-level-badge">{nivelUsuario}</span>
                </div>
                <div className="ds-identidade-info">
                    <h1>{nomeUsuario}</h1>
                    <p>{tipoUsuario} - Nível {nivelUsuario}</p>
                </div>
            </div>

            <div className="ds-actions-bloco">
                {/* Botão Pagamentos (NOVO) */}
                <button className="ds-action-btn" title="Meus Pagamentos" onClick={aoAbrirPagamentos}>
                    <i className="fas fa-wallet"></i>
                </button>
                
                {/* Botão Cofre (Porquinho) */}
                <button 
                    className="ds-action-btn" 
                    title="Banco de Resgate" 
                    onClick={aoAbrirCofre}
                    style={{color: saldoCofre > 0 ? 'var(--ds-cor-primaria)' : 'inherit', borderColor: saldoCofre > 0 ? 'var(--ds-cor-primaria)' : 'var(--ds-cor-cinza-borda)'}}
                >
                    <i className="fas fa-piggy-bank"></i>
                    {saldoCofre > 0 && (
                        <span className="ds-badge" style={{backgroundColor: 'var(--ds-cor-sucesso)', border: 'none', top: '-5px', right: '-5px'}}>
                            {Math.round(saldoCofre)}
                        </span>
                    )}
                </button>

                {/* Botão Desempenho (Modal do Extrato) */}
                <button className="ds-action-btn" title="Meu Desempenho" onClick={aoAbrirDesempenho}>
                    <i className="fas fa-chart-line"></i>
                </button>

                {/* Botão Perfil */}
                <button id="btnAcaoPerfil" className="ds-action-btn" title="Meu Perfil" onClick={aoAbrirPerfil}>
                    <i className="fas fa-user-cog"></i>
                </button>

                {/* Botão Sair */}
                <button id="logoutBtn" className="ds-action-btn ds-btn-sair" title="Sair" onClick={aoSair}>
                    <i className="fas fa-sign-out-alt"></i>
                </button>
            </div>
        </header>
    );
}