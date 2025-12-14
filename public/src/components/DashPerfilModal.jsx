import React, { useState, useEffect } from 'react';
import { fetchAPI } from '/js/utils/api-utils.js';
// IMPORTA O GERENCIADOR DE POPUPS
import { mostrarMensagem, mostrarConfirmacao } from '/js/utils/popups.js';

export default function DashPerfilModal({ usuarioAtual, onClose, aoAtualizarAvatar }) {
    const [avatares, setAvatares] = useState([]);
    const [loading, setLoading] = useState(false);
    const [modoEdicao, setModoEdicao] = useState(false);

    useEffect(() => {
        carregarGaleria();
    }, []);

    const carregarGaleria = async () => {
        setLoading(true);
        try {
            const dados = await fetchAPI('/api/avatares');
            setAvatares(dados);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setLoading(true);
        const formData = new FormData();
        formData.append('foto', file);

        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/avatares/upload', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            const data = await res.json();
            
            if (!res.ok) throw new Error(data.error || 'Erro no upload');
            
            await carregarGaleria();
            mostrarMensagem('Foto adicionada com sucesso!', 'sucesso'); // POPUP
        } catch (error) {
            mostrarMensagem(`Erro: ${error.message}`, 'erro'); // POPUP
        } finally {
            setLoading(false);
            e.target.value = '';
        }
    };

    const handleSelecionar = async (id) => {
        if (modoEdicao) return;
        setLoading(true);
        try {
            await fetchAPI(`/api/avatares/definir-ativo/${id}`, { method: 'PUT' });
            aoAtualizarAvatar();
            mostrarMensagem('Foto de perfil atualizada!', 'sucesso'); // POPUP
            onClose();
        } catch (error) {
            mostrarMensagem(error.message, 'erro'); // POPUP
            setLoading(false);
        }
    };

    const handleExcluir = async (id) => {
        // CONFIRMAÇÃO COM POPUP
        const confirmado = await mostrarConfirmacao('Tem certeza que deseja excluir esta foto?');
        if (!confirmado) return;

        setLoading(true);
        try {
            await fetchAPI(`/api/avatares/${id}`, { method: 'DELETE' });
            await carregarGaleria();
            aoAtualizarAvatar(); 
            mostrarMensagem('Foto excluída.', 'info'); // POPUP
        } catch (error) {
            mostrarMensagem(error.message, 'erro'); // POPUP
        } finally {
            setLoading(false);
        }
    };


    return (
        <div className="ds-popup-overlay ativo" onClick={onClose} style={{zIndex: 1300}}>
            <div className="ds-modal-assinatura-content" onClick={e => e.stopPropagation()} style={{textAlign: 'center', padding: '30px', position: 'relative'}}>
                
                {/* BOTÃO X SIMPLES (NOVO DESIGN) */}
                <button className="ds-modal-close-simple" onClick={onClose}>
                    <i className="fas fa-times"></i>
                </button>

                <h2 style={{color: 'var(--ds-cor-azul-escuro)', marginBottom: '10px'}}>Meu Perfil</h2>
                
                {/* Avatar Atual Grande */}
                <div style={{width: '120px', height: '120px', borderRadius: '50%', margin: '0 auto 20px auto', border: '4px solid #fff', boxShadow: '0 4px 10px rgba(0,0,0,0.1)'}}>
                    <img src={usuarioAtual?.avatar_url || './img/default-avatar.png'} alt="Atual" style={{width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%'}} />
                </div>

                <div style={{marginBottom: '20px'}}>
                    <h3>{usuarioAtual?.nome}</h3>
                    <p style={{color: 'var(--ds-cor-primaria)'}}>Nível {usuarioAtual?.nivel}</p>
                </div>

                <hr style={{border: '0', borderTop: '1px solid #eee', margin: '20px 0'}} />

                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'15px'}}>
                    <h4 style={{margin:0, color:'#666'}}>Minha Galeria</h4>
                    <button 
                        className={`ds-btn ds-btn-pequeno ${modoEdicao ? 'ds-btn-primario' : 'ds-btn-outline-primario'}`}
                        onClick={() => setModoEdicao(!modoEdicao)}
                    >
                        {modoEdicao ? 'Concluir' : 'Gerenciar'}
                    </button>
                </div>

                {/* Grid da Galeria */}
                <div className="ds-galeria-avatar-grid" style={{display:'flex', justifyContent:'center', gap:'15px', flexWrap:'wrap'}}>
                    {loading && avatares.length === 0 ? <div className="ds-spinner"></div> : 
                        avatares.map(avatar => (
                            <div key={avatar.id} 
                                 className={`ds-avatar-slot ${avatar.ativo ? 'ativo' : ''}`}
                                 style={{position:'relative', width:'80px', height:'80px', borderRadius:'50%', cursor: modoEdicao ? 'default' : 'pointer', border: avatar.ativo ? '3px solid var(--ds-cor-sucesso)' : '3px solid #eee'}}
                                 onClick={() => handleSelecionar(avatar.id)}
                            >
                                <img src={avatar.url_blob} style={{width:'100%', height:'100%', borderRadius:'50%', objectFit:'cover'}} />
                                
                                {modoEdicao && (
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); handleExcluir(avatar.id); }}
                                        style={{position:'absolute', top:'-5px', right:'-5px', background:'var(--ds-cor-perigo)', color:'#fff', border:'none', borderRadius:'50%', width:'24px', height:'24px', cursor:'pointer'}}
                                    >
                                        <i className="fas fa-times"></i>
                                    </button>
                                )}
                            </div>
                        ))
                    }

                    {!loading && avatares.length < 3 && (
                        <div className="ds-avatar-slot" style={{width:'80px', height:'80px', borderRadius:'50%', border:'3px dashed #ccc', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer'}}
                             onClick={() => document.getElementById('upload-input-react').click()}
                        >
                            <i className="fas fa-plus" style={{color:'#ccc', fontSize:'1.5rem'}}></i>
                        </div>
                    )}
                </div>

                <input type="file" id="upload-input-react" accept="image/*" style={{display:'none'}} onChange={handleUpload} />
                
                <p style={{fontSize:'0.8rem', color:'#999', marginTop:'15px'}}>
                    {modoEdicao ? 'Clique no X para excluir uma foto.' : 'Clique em uma foto para defini-la como perfil.'}
                </p>
            </div>
        </div>
    );
}