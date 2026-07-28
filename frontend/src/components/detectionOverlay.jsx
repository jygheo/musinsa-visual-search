import React, { useRef } from 'react';
import './detectionOverlay.css';

export default function DetectionOverlay({ 
    imageSrc, 
    detections, 
    onSelectCrop, 
    onReset, 
    onSearchFull, 
    onManualCrop 
}) {
    const imageRef = useRef(null);
    
    const handleBoxClick = (bbox) => {
        const img = imageRef.current;
        if (!img) return;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Calculate actual pixel dimensions from the normalized (0-1) YOLO output
        const cropX = bbox.x * img.naturalWidth;
        const cropY = bbox.y * img.naturalHeight;
        const cropW = bbox.w * img.naturalWidth;
        const cropH = bbox.h * img.naturalHeight;

        canvas.width = cropW;
        canvas.height = cropH;

        // Draw just the selected bounding box area to the canvas
        ctx.drawImage(
            img,
            cropX, cropY, cropW, cropH,
            0, 0, cropW, cropH
        );

        canvas.toBlob((blob) => {
            if (blob) onSelectCrop(blob);
        }, 'image/jpeg');
    };

    return (
        <div className="detection-overlay-container">
            <div className="detection-instructions">
                Select an item to search, or choose an option below.
            </div>
            
            <div className="image-wrapper">
                <img ref={imageRef} src={imageSrc} alt="uploaded" className="source-image" />
                
                {}
                {detections && detections.map((det, i) => (
                    <div
                        key={i}
                        className="bounding-box"
                        style={{
                            left: `${det.bbox.x * 100}%`,
                            top: `${det.bbox.y * 100}%`,
                            width: `${det.bbox.w * 100}%`,
                            height: `${det.bbox.h * 100}%`
                        }}
                        onClick={() => handleBoxClick(det.bbox)}
                        title="Click to search this item"
                    />
                ))}
            </div>

            <div className="detection-actions">
                <button onClick={onSearchFull} className="action-btn primary">
                    Search Entire Image
                </button>
                <button onClick={onManualCrop} className="action-btn secondary">
                    Manual Crop
                </button>
                <button onClick={onReset} className="action-btn danger">
                    Cancel
                </button>
            </div>
        </div>
    );
}