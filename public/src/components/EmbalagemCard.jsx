// public/src/components/EmbalagemCard.jsx

import React from 'react';
import { getImagemVariacao } from '../utils/EmbalagemProdutoHelpers.js';

// Função para formatar o tempo (não muda)
function formatarTempoDecorrido(data) {
    if (!data) return 'Calculando...';
    const agora = new Date();
    const dataPassada = new Date(data);
    const segundos = Math.floor((agora - dataPassada) / 1000);

    let intervalo = segundos / 86400; // dias
    if (intervalo > 1) return `há ${Math.floor(intervalo)} dias`;
    intervalo = segundos / 3600; // horas
    if (intervalo > 1) return `há ${Math.floor(intervalo)}h`;
    intervalo = segundos / 60; // minutos
    if (intervalo > 1) return `há ${Math.floor(intervalo)}min`;
    return 'agora mesmo';
}

export function EmbalagemCard({ item, todosOsProdutos, onClick }) {
    const produtoCompleto = todosOsProdutos.find(p => p.id === item.produto_id);
    const imagemSrc = getImagemVariacao(produtoCompleto, item.variante);
    const tempoEmFila = formatarTempoDecorrido(item.data_lancamento_mais_recente);
    // Agora, as duas variáveis de tempo usam a MESMA fonte de dados, que é a correta
    const tempoAguardando = formatarTempoDecorrido(item.data_lancamento_mais_antiga);
    const dataMaisAntigaFormatada = new Intl.DateTimeFormat('pt-BR').format(new Date(item.data_lancamento_mais_antiga));

    const diffDiasAntigo = Math.floor((new Date() - new Date(item.data_lancamento_mais_antiga)) / (1000 * 60 * 60 * 24));
    const isAguardandoMuito = diffDiasAntigo >= 2;

    // A classe principal agora será diferente para aplicarmos o novo estilo
    const cardClassName = `ep-card-fluxo ${isAguardandoMuito ? 'aguardando-muito' : ''}`;

    const handleClick = () => onClick(item);

    return (
        // O container principal que permite o posicionamento da borda e do rodapé
        <div className={cardClassName} onClick={handleClick}>
            {/* 1. Borda de Status Vertical */}
            <div className="card-borda-charme"></div>

            {/* 2. Corpo Principal (Grid de 2 colunas: Imagem + Info) */}
            <div className="card-corpo-principal">
                <img src={imagemSrc} alt={item.produto} className="card-imagem-produto" />
                
                <div className="card-info-bloco">
                    {/* Bloco Superior: Identidade do Produto */}
                    <div className="info-identidade">
                        <h3>{item.produto}</h3>
                        <p>{item.variante && item.variante !== '-' ? item.variante : 'Padrão'}</p>
                        <p className="info-sku">SKU: {item.sku}</p>
                    </div>

                    {/* Bloco Inferior: Status Temporal */}
                    <div className="info-status-temporal">
                        <span className="info-item" title={`Data do lote mais antigo na fila de embalagem: ${dataMaisAntigaFormatada}`}>
                            <i className="fas fa-calendar-alt"></i>
                            <span>Arrematado em: {dataMaisAntigaFormatada}</span>
                        </span>
                        <span className="info-item" title={`Há quanto tempo o lote mais antigo está aguardando`}>
                            <i className="fas fa-hourglass-start"></i>
                            <span>Aguardando {tempoAguardando}</span>
                        </span>
                    </div>
                </div>

            </div>

            {/* 3. Rodapé de Status (Quantidade Disponível) */}
            <div className="card-rodape-status">
                <span className="rodape-label">DISPONÍVEL</span>
                <span className="rodape-valor">{item.total_disponivel_para_embalar}</span>
            </div>
        </div>
    );
}