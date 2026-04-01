import React, { useState, useEffect, useRef } from 'react';
import { normalizeText } from '../utils/searchHelpers.js'; // << IMPORTANDO A FUNÇÃO

export default function SearchableSelect({
    options,          
    placeholder,      
    onChange,         
    initialValue,     
}) {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedValue, setSelectedValue] = useState(initialValue || null);
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef(null);

    const selectedLabel = options.find(opt => opt.value === selectedValue)?.label || '';

    // Filtra as opções com base no termo de busca normalizado
    const normalizedSearchTerm = normalizeText(searchTerm);
    
    const filteredOptions = searchTerm.length === 0
        ? options
        : options.filter(option =>
            normalizeText(option.label).includes(normalizedSearchTerm)
        );

    // Sincroniza o estado interno se a prop inicial mudar (ex: reset do formulário)
    useEffect(() => {
        setSelectedValue(initialValue || null);
    }, [initialValue]);

    // Efeito para fechar o dropdown quando o usuário clica fora
    useEffect(() => {
        function handleClickOutside(event) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [wrapperRef]);
    
    // Função chamada quando um item da lista é clicado
    const handleSelectOption = (value) => {
        setSelectedValue(value);    // Atualiza o estado interno
        onChange(value);            // Notifica o componente pai sobre a mudança
        setIsOpen(false);           // Fecha o dropdown
        setSearchTerm('');          // Limpa a busca
    };

    // Função para lidar com a digitação no input
    const handleInputChange = (e) => {
        setSearchTerm(e.target.value);
        if (!isOpen) {
            setIsOpen(true); // Abre o dropdown ao começar a digitar
        }
    };
    
    // Reseta a seleção se o usuário limpar o campo
    const handleClear = () => {
        setSelectedValue(null);
        onChange(null);
        setSearchTerm('');
    };

    return (
        <div className="searchable-select-wrapper" ref={wrapperRef}>
            <div className="searchable-select-input-container">
                <input
                    type="text"
                    className="fc-input"
                    placeholder={placeholder}
                    value={selectedValue ? selectedLabel : searchTerm}
                    onChange={handleInputChange}
                    onClick={() => setIsOpen(!isOpen)}
                />
                {selectedValue && (
                    <button type="button" className="clear-btn" onClick={handleClear}>
                        <i className="fas fa-times"></i>
                    </button>
                )}
            </div>
            
            {isOpen && (
                <div className="searchable-select-dropdown">
                    {filteredOptions.length > 0 ? (
                        filteredOptions.map(option => (
                            <div
                                key={option.value}
                                className="dropdown-item"
                                onClick={() => handleSelectOption(option.value)}
                            >
                                {option.label}
                            </div>
                        ))
                    ) : (
                        <div className="dropdown-item-disabled">Nenhum resultado encontrado.</div>
                    )}
                </div>
            )}
        </div>
    );
}