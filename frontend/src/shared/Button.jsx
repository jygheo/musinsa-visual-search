import React from 'react';
import './shared.css';

export default function Button({ variant = 'primary', className = '', children, ...props }) {
    return (
        <button className={`action-btn ${variant} ${className}`} {...props}>
            {children}
        </button>
    );
}