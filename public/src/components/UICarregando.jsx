// public/src/components/UICarregando.jsx
// Componente universal de carregamento do sistema LV.
//
// Use para: carregamentos de página, abas e seções de dados.
// NÃO use para: agentes de IA em processamento — use UIAgenteIA.LoaderIA.
//
// Props:
//   variante : 'bloco' (padrão) | 'pagina' | 'inline'
//     - bloco  : centraliza no container pai, ideal para abas e seções
//     - pagina : cobre a tela toda (carregamento inicial da página)
//     - inline : compacto, sem LV, para uso dentro de outros elementos
//   tamanho  : 'sm' | 'md' (padrão) | 'lg' — define o tamanho do spinner
//              (quando omitido: pagina→lg, inline→sm, bloco→md)
//   texto    : string opcional exibida abaixo do spinner
//
// Para trocar o visual sem quebrar o sistema, altere apenas as classes
// CSS começando com `.ui-cg-*` em global-style.css.

import React from 'react';

export default function UICarregando({ variante = 'bloco', tamanho, texto }) {
    const tam = tamanho || (variante === 'pagina' ? 'lg' : variante === 'inline' ? 'sm' : 'md');
    const mostrarLetras = variante !== 'inline';

    return (
        <div className={`ui-cg ui-cg--${variante}`}>
            <div className={`ui-cg-spinner ui-cg-spinner--${tam}`}>
                <div className="ui-cg-trilha"></div>
                <div className="ui-cg-arco"></div>
                {mostrarLetras && <span className="ui-cg-letras">LV</span>}
            </div>
            {texto && variante !== 'inline' && (
                <span className="ui-cg-texto">{texto}</span>
            )}
        </div>
    );
}
