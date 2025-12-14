import React from 'react';
import UserCard from './UserCard';

export default function UserListCards({ usuarios, permissoesLogado, aoAtualizarLista, aoAbrirFerias, aoAbrirVinculo }) {
    if (!usuarios || usuarios.length === 0) {
        return <p className="uc-sem-resultados">Nenhum usuário encontrado com os filtros aplicados.</p>;
    }

    return (
        <div className="uc-usuarios-lista">
            {usuarios.map(usuario => (
                <UserCard 
                    key={usuario.id} 
                    usuario={usuario}
                    permissoesLogado={permissoesLogado}
                    aoAtualizarLista={aoAtualizarLista}
                    aoAbrirFerias={aoAbrirFerias}
                    aoAbrirVinculo={aoAbrirVinculo}
                />
            ))}
        </div>
    );
}