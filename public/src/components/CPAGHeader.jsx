import React from 'react';

export default function CPAGHeader({ titulo, breadcrumbs }) {
  return (
    <header className="cpg-header">
      <div className="cpg-breadcrumbs">
        {breadcrumbs.map((item, index) => (
          <span key={index}>
            {index > 0 && <span className="separator"> / </span>}
            <span className={index === breadcrumbs.length - 1 ? 'active' : ''}>
              {item}
            </span>
          </span>
        ))}
      </div>
      <div className="cpg-header-actions">
        {/* Aqui podemos colocar botões globais se precisar no futuro */}
      </div>
    </header>
  );
}