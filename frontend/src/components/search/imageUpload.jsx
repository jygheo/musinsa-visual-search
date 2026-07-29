import React, { useState, useRef } from 'react';
import ImageIcon from '@mui/icons-material/Image';
import { useImageValidation } from '../../hooks/useImageValidation';
import ErrorBanner from "../../shared/ErrorBanner";
import UrlSearch from './urlSearch';
import './imageUpload.css';

export default function ImageUpload({ setImageSrc, setImageUrl, setCroppedImage }) {
    const fileInputRef = useRef(null);
    const [errorMessage, setErrorMessage] = useState("");
    const [isDragged, setIsDragged] = useState(false);
    
    const { validateFile, validateUrl } = useImageValidation();

    const handleUploadClick = (e) => {
        e.preventDefault();
        fileInputRef.current.click();
    };

    const handleFileChange = (e) => {
        setErrorMessage('');
        const file = e.target.files[0];
        if (file) {
            const { isValid, error } = validateFile(file);
            if (isValid) {
                setCroppedImage(null);
                setImageSrc(URL.createObjectURL(file));
            } else {
                setErrorMessage(error);
            }
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragged(false);
        setErrorMessage('');

        const items = e.dataTransfer.items;
        if (!items || items.length === 0) {
            setErrorMessage("No file found in drop");
            return;
        }
        
        const item = items[0];
        if (item.kind === "file") {
            const file = item.getAsFile();
            if (file) {
                const { isValid, error } = validateFile(file);
                if (isValid) {
                    setCroppedImage(null);
                    setImageSrc(URL.createObjectURL(file));
                } else {
                    setErrorMessage(error);
                }
            }
        } else if (item.kind === "string" && item.type === "text/uri-list") {
            item.getAsString((url) => {
                validateUrl(url)
                    .then(() => {
                        setCroppedImage(null);
                        setImageUrl(url);
                    })
                    .catch(() => setErrorMessage("Dropped file is not an image"));
            });
        } else {
            setErrorMessage("Dropped file is not an image");
        }
    };

    return (
        <div className="image-upload-container">
            <ErrorBanner message={errorMessage} onClose={() => setErrorMessage('')} />

            <form className="upload-form">
                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden-input"
                    onChange={handleFileChange}
                    accept="image/*"
                />

                <div className="upload-section">
                    <div
                        className={`drag-zone ${isDragged ? 'drag-zone-on' : ''}`}
                        onDragEnter={(e) => { e.preventDefault(); setIsDragged(true); }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={handleDrop}
                        onDragLeave={(e) => { e.preventDefault(); setIsDragged(false); }}
                        onClick={handleUploadClick}
                    >
                        <ImageIcon className="upload-icon" />
                        <p className="upload-text">
                            Drop your image here, or <span className="fake-link">browse</span>
                        </p>
                    </div>

                    <div className="line-container">
                        <div className="line" />
                        <span className="line-text">OR</span>
                        <div className="line" />
                    </div>

                    <UrlSearch 
                        setImageUrl={setImageUrl} 
                        setCroppedImage={setCroppedImage} 
                        onError={setErrorMessage} 
                    />
                </div>
            </form>
        </div>
    );
}