import React, { useRef, useMemo } from 'react';
import './detectionOverlay.css';
import BoundingBox from './boundingBox';

export default function DetectionOverlay({
    imageSrc,
    detections,
    isDetecting,
    onSelectCrop,
    onReset,
    onSearchFull,
    onManualCrop
}) {
    const imageRef = useRef(null);

    // Sort boxes by area (descending) so the smallest boxes naturally render on top.
    const sortedDetections = useMemo(() => {
        if (!detections) return [];
        return [...detections].sort((a, b) => {
            const areaA = a.bbox.w * a.bbox.h;
            const areaB = b.bbox.w * b.bbox.h;
            return areaB - areaA;
        });
    }, [detections]);

    const handleBoxClick = (bbox) => {
        const img = imageRef.current;
        if (!img) return;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const cropX = bbox.x * img.naturalWidth;
        const cropY = bbox.y * img.naturalHeight;
        const cropW = bbox.w * img.naturalWidth;
        const cropH = bbox.h * img.naturalHeight;

        canvas.width = cropW;
        canvas.height = cropH;

        ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

        canvas.toBlob((blob) => {
            if (blob) onSelectCrop(blob);
        }, 'image/jpeg');
    };

    return (
        <div className="detection-overlay-container">
            <p className="detection-hint">
                {sortedDetections.length > 0
                    ? 'Tap a tagged item to search it'
                    : "Didn't spot anything — try a manual crop instead"}
            </p>

            <div className="image-wrapper">
                <img ref={imageRef} src={imageSrc} alt="uploaded" className="source-image" />

                {isDetecting && (
                    <div className="detecting-overlay">
                        <div className="scan-line" />
                        <span className="pulse-text">Scanning for items&hellip;</span>
                    </div>
                )}

                {!isDetecting && sortedDetections.map((det, i) => (
                    <BoundingBox key={i} bbox={det.bbox} onClick={handleBoxClick} />
                ))}
            </div>

            <div className="detection-actions">
                <button className="det-btn det-btn-primary" onClick={onSearchFull}>
                    Search whole image
                </button>
                <button className="det-btn det-btn-secondary" onClick={onManualCrop}>
                    Crop manually
                </button>
                <button className="det-btn det-btn-ghost" onClick={onReset}>
                    Start over
                </button>
            </div>
        </div>
    );
}