// public/src/components/Toast.jsx
import React, { useEffect } from 'react';

// Estilos CSS embutidos para não precisar criar um novo arquivo .css
const toastStyles = {
  position: 'fixed',
  top: '40%', // Posiciona um pouco acima do meio
  left: '50%', // Centraliza horizontalmente
  transform: 'translate(-50%, -50%)', // Centraliza o elemento em si
  padding: '16px 25px', // Um pouco maior para mais destaque
  borderRadius: '8px',
  color: '#fff',
  fontSize: '1rem', // Fonte um pouco maior
  fontWeight: '500',
  zIndex: 9999,
  boxShadow: '0 5px 20px rgba(0,0,0,0.2)',
  transition: 'transform 0.3s ease-out, opacity 0.3s ease-out',
  opacity: 0, // Começa invisível
  transform: 'translate(-50%, -50%) scale(0.8)', // Começa um pouco menor para um efeito de "pop"
};

const successStyles = {
  backgroundColor: '#27ae60', // Verde
};

const errorStyles = {
  backgroundColor: '#e74c3c', // Vermelho
};

export default function Toast({ message, type, onDone }) {
  useEffect(() => {
    // Anima a entrada do toast
    const enterTimeout = setTimeout(() => {
      const el = document.getElementById('toast-notification');
      if (el) {
        // <<< MUDANÇA AQUI: Animação de escala para um efeito "pop"
        el.style.transform = 'translate(-50%, -50%) scale(1)';
        el.style.opacity = 1;
      }
    }, 10);

    // Agenda o desaparecimento do toast
    const exitTimeout = setTimeout(() => {
      const el = document.getElementById('toast-notification');
      if (el) {
        el.style.transform = 'translate(-50%, -50%) scale(0.8)';
        el.style.opacity = 0;
      }
    }, 2800);

    // Remove o toast do DOM após a animação
    const removeTimeout = setTimeout(() => {
      onDone();
    }, 3000);

    // Limpa os timers se o componente for desmontado antes
    return () => {
      clearTimeout(enterTimeout);
      clearTimeout(exitTimeout);
      clearTimeout(removeTimeout);
    };
  }, [onDone]);

  const style = {
    ...toastStyles,
    ...(type === 'success' ? successStyles : errorStyles),
  };

  return (
    <div id="toast-notification" style={style}>
      {message}
    </div>
  );
}