import React from 'react';

const TIPOS_DISPONIVEIS = [
    { id: 'administrador', label: 'Administrador' },
    { id: 'socio', label: 'Sócio' }, // <--- ADICIONADO A CATEGORIA NOVA
    { id: 'supervisor', label: 'Supervisor' },
    { id: 'lider_setor', label: 'Líder de Setor' },
    { id: 'costureira', label: 'Costureira' },
    { id: 'tiktik', label: 'TikTik' },
    { id: 'cortador', label: 'Cortador' }
];

export default function UserFiltros({ filtroAtual, setFiltroAtual }) {
    return (
        <div className="uc-controles-topo">
            <div className="uc-filtro-tipo">
                <label htmlFor="filtroTipoUsuario">Filtrar por Tipo:</label>
                <select 
                    id="filtroTipoUsuario" 
                    value={filtroAtual} 
                    onChange={(e) => setFiltroAtual(e.target.value)}
                >
                    <option value="">Todos</option>
                    {TIPOS_DISPONIVEIS.map(tipo => (
                        <option key={tipo.id} value={tipo.id}>{tipo.label}</option>
                    ))}
                </select>
            </div>
            
            {/* Aqui você pode adicionar um botão de "Novo Usuário" no futuro */}
        </div>
    );
}