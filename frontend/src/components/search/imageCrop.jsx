import CancelIcon from '@mui/icons-material/Cancel';
import ReactCrop from 'react-image-crop';
import React, { useState, useRef, useEffect } from 'react';
import { getCroppedImgBlob } from '../../utils/cropCanvas';
import './imageCrop.css';
import 'react-image-crop/dist/ReactCrop.css';

export default function ImageCrop({ imageSrc, resetImage, clearSource, setCroppedImage, onAutoDetect, isDetecting }) {
  const [crop, setCrop] = useState(null);
  const [imgLoading, setImgLoading] = useState(true);
  const imgRef = useRef(null);

  useEffect(() => {
    setImgLoading(true);
  }, [imageSrc]);

  const handleImageLoad = (e) => {
    imgRef.current = e.currentTarget;
    setCrop({ unit: '%', x: 0, y: 0, width: 100, height: 100 });
    setImgLoading(false);
  };

  const handleSearch = async () => {
    if (!crop || !imgRef.current) {
      return;
    }
    const croppedBlob = await getCroppedImgBlob(imgRef.current, crop, 'cropped.jpeg', false);
    if (croppedBlob) {
      setCroppedImage(croppedBlob);
      clearSource();
    }
  };

  return (
    <div className="image-crop-container">
      <div className="crop-header">
        <p className="crop-title">Crop to the item, or let us find it</p>
      </div>

      <div className="crop-wrapper">
        <CancelIcon onClick={resetImage} className="close-icon" />
        <ReactCrop className="react-crop-custom" crop={crop} onChange={setCrop} objectFit="contain" zoom={1} disabled={isDetecting}>
          <img
            src={imageSrc}
            onLoad={handleImageLoad}
            alt="Crop source"
            style={{
              maxWidth: '100%',
              maxHeight: '55vh',
              width: 'auto',
              height: 'auto',
              objectFit: 'contain',
              display: 'block',
              opacity: imgLoading ? 0 : 1,
              transition: 'opacity 0.15s ease'
            }}
          />
        </ReactCrop>

        {imgLoading && !isDetecting && (
          <div className="scan-overlay">
            <span className="scan-label">Loading image&hellip;</span>
          </div>
        )}

        {isDetecting && (
          <div className="scan-overlay">
            <div className="scan-line" />
            <span className="scan-label">Scanning for items&hellip;</span>
          </div>
        )}
      </div>

      <div className="crop-actions">
        <button onClick={handleSearch} className="crop-btn crop-btn-primary" disabled={isDetecting}>
          Search this crop
        </button>
        <button onClick={onAutoDetect} className="crop-btn crop-btn-secondary" disabled={isDetecting}>
          Auto-detect items
        </button>
      </div>
    </div>
  );
}