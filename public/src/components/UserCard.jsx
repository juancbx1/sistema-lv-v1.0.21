import React, { useState } from 'react';
import UserCardView from './UserCardView';
import UserCardEdicao from './UserCardEdicao';
import { fetchAPI } from '/js/utils/api-utils.js';
import { mostrarMensagem, mostrarConfirmacao } from '/js/utils/popups.js';


export default function UserCard({ usuario, permissoesLogado, aoAtualizarLista, aoAbrirFerias, aoAbrirVinculo, concessionarias  }) {
    const [modoEdicao, setModoEdicao] = useState(false);
    const [salvando, setSalvando] = useState(false);

    // Função para salvar as alterações vindas do UserCardEdicao
    const handleSalvar = async (dadosAtualizados) => {
        setSalvando(true);
        try {
            await fetchAPI('/api/usuarios', {
                method: 'PUT',
                body: JSON.stringify(dadosAtualizados)
            });
            
            mostrarMensagem('Usuário atualizado com sucesso!', 'sucesso');
            setModoEdicao(false);
            aoAtualizarLista(); // Recarrega a lista pai
        } catch (error) {
            mostrarMensagem(`Erro ao salvar: ${error.message}`, 'erro');
        } finally {
            setSalvando(false);
        }
    };

    const handleImpersonar = async () => {
        try {
            const { token, nome } = await fetchAPI(`/api/usuarios/${usuario.id}/impersonar`, { method: 'POST' });
            const url = `/dashboard/dashboard.html?impersonando=${encodeURIComponent(token)}`;
            window.open(url, '_blank');
        } catch (error) {
            mostrarMensagem(`Erro ao iniciar impersonação: ${error.message}`, 'erro');
        }
    };

    const handleExcluir = async () => {
        const confirmado = await mostrarConfirmacao(`Tem certeza que deseja excluir o usuário "${usuario.nome}"?`);
        if (!confirmado) return;

        try {
            await fetchAPI('/api/usuarios', {
                method: 'DELETE',
                body: JSON.stringify({ id: usuario.id })
            });
            mostrarMensagem('Usuário excluído!', 'sucesso');
            aoAtualizarLista();
        } catch (error) {
            mostrarMensagem(`Erro ao excluir: ${error.message}`, 'erro');
        }
    };

    // Renderização Condicional
    if (modoEdicao) {
        return (
            <UserCardEdicao 
                usuario={usuario} 
                onSalvar={handleSalvar} 
                onCancelar={() => setModoEdicao(false)} 
                salvando={salvando}
                concessionarias={concessionarias}
            />
        );
    }

    return (
        <UserCardView
            usuario={usuario}
            permissoesLogado={permissoesLogado}
            onEditar={() => setModoEdicao(true)}
            onExcluir={handleExcluir}
            onFerias={() => aoAbrirFerias(usuario)}
            onVinculo={() => aoAbrirVinculo(usuario)}
            onImpersonar={handleImpersonar}
        />
    );
}