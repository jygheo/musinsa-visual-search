import React, { useState, useRef } from 'react';
import SearchIcon from '@mui/icons-material/Search';
import { useImageValidation } from '../../hooks/useImageValidation';

export default function UrlSearch({ setImageUrl, setCroppedImage, onError }) {
    const urlInputRef = useRef(null);
    const [tempImageUrl, setTempImageUrl] = useState("");
    const { validateUrl } = useImageValidation();

    const processUrlSubmit = (url) => {
        onError('');
        validateUrl(url)
            .then(() => {
                setCroppedImage(null);
                setImageUrl(url);
            })
            .catch((err) => onError(err.error || "Pasted URL is not a valid image"));
    };

    const handleEnter = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            processUrlSubmit(e.target.value);
        }
    };

    const handleSearchButton = (e) => {
        e.preventDefault();
        processUrlSubmit(urlInputRef.current.value);
    };

    return (
        <div className="search-wrapper">
            <div className="url-input-wrapper">
                <span className="icon"><SearchIcon /></span>
                <input
                    id="url"
                    type="url"
                    name="url"
                    ref={urlInputRef}
                    placeholder="Paste Image URL"
                    onChange={(e) => setTempImageUrl(e.target.value)}
                    onKeyDown={handleEnter}
                    value={tempImageUrl}
                    className="url-input"
                />
            </div>
            <button className="url-search-button" onClick={handleSearchButton}>
                Search
            </button>
        </div>
    );
}