// public/src/components/AutocompleteAPI.jsx

import React, { useState, useEffect, useRef, useCallback } from 'react';

// Hook customizado para "debounce" (atrasar a execução de uma função)
function useDebounce(value, delay) {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);
        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);
    return debouncedValue;
}

export default function AutocompleteAPI({
    apiEndpoint,      // Ex: '/api/financeiro/contatos'
    placeholder,
    onSelectionChange, // Retorna o objeto selecionado completo {id, nome, tipo} ou null
    initialSelection, // Objeto inicial {id, nome}
}) {
    const [searchTerm, setSearchTerm] = useState(initialSelection?.nome || '');
    const [selectedItem, setSelectedItem] = useState(initialSelection || null);
    const [results, setResults] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef(null);

    const debouncedSearchTerm = useDebounce(searchTerm, 400); // Atraso de 400ms para a busca

     useEffect(() => {
        setSelectedItem(initialSelection || null);
        setSearchTerm(initialSelection?.nome || '');
    }, [initialSelection]);
    
    // Efeito que busca na API quando o termo de busca "debounced" muda
    useEffect(() => {
        if (debouncedSearchTerm.length < 2 || (selectedItem && debouncedSearchTerm === selectedItem.nome)) {
            setResults([]);
            setIsOpen(false);
            return;
        }

        const fetchData = async () => {
            setIsLoading(true);
            try {
                const token = localStorage.getItem('token');
                const response = await fetch(`${apiEndpoint}?q=${encodeURIComponent(debouncedSearchTerm)}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await response.json();
                setResults(data);
                setIsOpen(true);
            } catch (error) {
                console.error("Erro na busca do autocomplete:", error);
                setResults([]);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [debouncedSearchTerm, apiEndpoint, selectedItem]);

    // Efeito para fechar o dropdown ao clicar fora
    useEffect(() => {
        function handleClickOutside(event) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSelect = (item) => {
        setSearchTerm(item.nome);
        setSelectedItem(item);
        setIsOpen(false);
        onSelectionChange(item); // Notifica o pai
    };

    const handleInputChange = (e) => {
        setSearchTerm(e.target.value);
        // Se o texto digitado não corresponde mais ao item selecionado, limpa a seleção
        if (selectedItem && e.target.value !== selectedItem.nome) {
            setSelectedItem(null);
            onSelectionChange(null);
        }
    };
    
    return (
        <div className="autocomplete-api-wrapper" ref={wrapperRef}>
            <div className="autocomplete-input-container">
                <input
                    type="text"
                    className="fc-input"
                    value={searchTerm}
                    onChange={handleInputChange}
                    placeholder={placeholder}
                    onClick={() => { if(results.length > 0) setIsOpen(true) }}
                />
                {isLoading && <i className="fas fa-spinner fa-spin status-icon"></i>}
                {selectedItem && !isLoading && <i className="fas fa-check-circle status-icon success"></i>}
                {!selectedItem && debouncedSearchTerm.length > 1 && !isLoading && <i className="fas fa-times-circle status-icon error"></i>}
            </div>
            
            {isOpen && (
                <div className="autocomplete-dropdown">
                    {results.length > 0 ? (
                        results.map(item => (
                            <div key={item.id} className="dropdown-item" onClick={() => handleSelect(item)}>
                                {item.nome} <span className="item-type">[{item.tipo}]</span>
                            </div>
                        ))
                    ) : (
                        <div className="dropdown-item-disabled">Nenhum resultado.</div>
                    )}
                </div>
            )}
        </div>
    );
}