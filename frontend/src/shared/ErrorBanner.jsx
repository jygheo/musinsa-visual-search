import React from 'react';
import CloseIcon from '@mui/icons-material/Close';
import './shared.css';

export default function ErrorBanner({ message, onClose }) {
    if (!message) return null;
    
    return (
        <div className="shared-error-banner">
            <span>{message}</span>
            <CloseIcon onClick={onClose} className="close-icon" />
        </div>
    );
}