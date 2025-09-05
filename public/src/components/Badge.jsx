// public/src/components/Badge.jsx
import React from 'react';

const Badge = ({ text, color, icon }) => {
    // Mapeia nomes de cores para classes CSS que vamos criar
    const colorClasses = {
        blue: 'badge-blue',
        purple: 'badge-purple',
        gray: 'badge-gray',
        orange: 'badge-orange',
        green: 'badge-green',
    };

    const badgeClass = `fc-badge-pill ${colorClasses[color] || 'badge-gray'}`;

    return (
        <span className={badgeClass}>
            {icon && <i className={`fas ${icon}`} style={{ marginRight: '5px' }}></i>}
            {text}
        </span>
    );
};

export default Badge;