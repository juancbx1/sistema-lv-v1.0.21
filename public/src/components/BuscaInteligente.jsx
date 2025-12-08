// public/src/components/BuscaInteligente.jsx

import React, { useState, useEffect, useRef } from 'react';

// Helper para normalizar texto (remove acentos e lowercase)
export const normalizarTexto = (texto) => {
    if (!texto) return '';
    return texto.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

// Helper para filtragem inteligente (Fuzzy / "per pret")
// Exportamos para que os componentes Pai possam usar na filtragem local
export const filtrarListaInteligente = (lista, termoBusca, campos) => {
    if (!termoBusca) return lista;
    
    const termoLimpo = normalizarTexto(termoBusca);
    const partesTermo = termoLimpo.split(' ').filter(p => p.length > 0);

    return lista.filter(item => {
        // Verifica se TODAS as partes do termo digitado existem em pelo menos UM dos campos
        return partesTermo.every(parte => {
            return campos.some(campo => {
                const valorCampo = normalizarTexto(item[campo]);
                return valorCampo.includes(parte);
            });
        });
    });
};

export default function BuscaInteligente({ 
    onSearch,           // Função chamada ao buscar (recebe o valor limpo ou bruto)
    placeholder = "Buscar...", 
    historicoKey = null, // Chave para salvar no localStorage (se null, não usa histórico)
    delay = 300,        // Debounce em ms
    initialValue = ""
}) {
    const [termo, setTermo] = useState(initialValue);
    const [focado, setFocado] = useState(false);
    const [historico, setHistorico] = useState([]);
    
    const timeoutRef = useRef(null);
    const containerRef = useRef(null);

   // Debounce da busca (COM CORREÇÃO DE PISCADA)
    const isFirstRun = useRef(true); 

    useEffect(() => {
        // Limpa timeout anterior
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        
        // CORREÇÃO: Bloqueia a execução se for a primeira vez
        if (isFirstRun.current) {
            isFirstRun.current = false;
            return; // Sai sem chamar onSearch
        }

        timeoutRef.current = setTimeout(() => {
            if (onSearch) onSearch(termo);
        }, delay);

        return () => clearTimeout(timeoutRef.current);
    }, [termo, delay, onSearch]);

    // Carregar histórico ao montar
    useEffect(() => {
        if (historicoKey) {
            const salvo = localStorage.getItem(`historico_busca_${historicoKey}`);
            if (salvo) {
                try { setHistorico(JSON.parse(salvo)); } catch(e) {}
            }
        }
    }, [historicoKey]);

    // Salvar histórico ao selecionar ou dar enter (lógica interna)
    const adicionarAoHistorico = (novoTermo) => {
        if (!historicoKey || !novoTermo || novoTermo.trim().length < 2) return;
        
        const novoHistorico = [
            novoTermo,
            ...historico.filter(h => h !== novoTermo)
        ].slice(0, 5); // Mantém apenas os 5 últimos

        setHistorico(novoHistorico);
        localStorage.setItem(`historico_busca_${historicoKey}`, JSON.stringify(novoHistorico));
    };

    const removerDoHistorico = (e, itemRemover) => {
        e.stopPropagation();
        const novoHistorico = historico.filter(h => h !== itemRemover);
        setHistorico(novoHistorico);
        localStorage.setItem(`historico_busca_${historicoKey}`, JSON.stringify(novoHistorico));
    };

    // Debounce da busca
    useEffect(() => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        
        timeoutRef.current = setTimeout(() => {
            if (onSearch) onSearch(termo);
        }, delay);

        return () => clearTimeout(timeoutRef.current);
    }, [termo, delay, onSearch]);

    // Fecha o histórico se clicar fora
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setFocado(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSelecionarRecente = (valor) => {
        setTermo(valor);
        setFocado(false);
        // Dispara busca imediata sem delay visual
        if (onSearch) onSearch(valor); 
    };

    return (
        <div className="gs-filtro-busca-wrapper" ref={containerRef} style={{position: 'relative', width: '100%'}}>
            <i className="fas fa-search" style={{
                position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', 
                color: '#aaa', pointerEvents: 'none'
            }}></i>
            
            <input
                type="text"
                className="op-input-busca-redesenhado" // Reutilizando sua classe existente
                style={{width: '100%', paddingLeft: '40px'}}
                placeholder={placeholder}
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                onFocus={() => setFocado(true)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        adicionarAoHistorico(termo);
                        setFocado(false);
                    }
                }}
            />

            {/* CAIXA DE HISTÓRICO */}
            {focado && historico.length > 0 && (
                <div className="gs-buscas-recentes-container">
                    <h4 className="gs-buscas-recentes-titulo">BUSCAS RECENTES</h4>
                    <div className="gs-buscas-recentes-lista">
                        {historico.map((h) => (
                            <div key={h} className="gs-pilula-recente" onClick={() => handleSelecionarRecente(h)}>
                                <span>{h}</span>
                                <span className="remover" onClick={(e) => removerDoHistorico(e, h)}>&times;</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}