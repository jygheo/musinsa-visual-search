import React, { useRef } from 'react';

export default function DetectionOverlay({ imageSrc, detections, onSelectCrop, onReset }) {
  const imageRef = useRef(null);

  const handleBoxClick = (bbox) => {
    const img = imageRef.current;
    if (!img) return;

    // Create a hidden canvas to extract the selected bounding box
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Convert normalized coordinates (0-1) to actual image pixel dimensions
    const cropX = bbox.x * img.naturalWidth;
    const cropY = bbox.y * img.naturalHeight;
    const cropW = bbox.w * img.naturalWidth;
    const cropH = bbox.h * img.naturalHeight;

    canvas.width = cropW;
    canvas.height = cropH;

    // Draw just the selected portion of the image onto the canvas
    ctx.drawImage(
      img,
      cropX, cropY, cropW, cropH, // Source coordinates
      0, 0, cropW, cropH          // Destination coordinates
    );

    // Convert canvas back to a Blob and trigger the search
    canvas.toBlob((blob) => {
      onSelectCrop(blob);
    }, 'image/jpeg', 0.95);
  };

  return (
    <div className="detection-overlay-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <p style={{ marginBottom: '1rem', color: '#666' }}>Tap an item to search</p>
      
      {}
      <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
        <img 
          ref={imageRef} 
          src={imageSrc} 
          alt="Detected items" 
          style={{ maxWidth: '100%', maxHeight: '60vh', display: 'block', borderRadius: '8px' }}
        />
        
        {detections.map((det, idx) => (
          <div
            key={idx}
            onClick={() => handleBoxClick(det.bbox)}
            style={{
              position: 'absolute',
              left: `${det.bbox.x * 100}%`,
              top: `${det.bbox.y * 100}%`,
              width: `${det.bbox.w * 100}%`,
              height: `${det.bbox.h * 100}%`,
              border: '2.5px solid #10b981',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              cursor: 'pointer',
              borderRadius: '4px',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(16, 185, 129, 0.35)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(16, 185, 129, 0.15)'}
          >
            <span style={{
              position: 'absolute',
              top: '-24px',
              left: '-2px',
              background: '#10b981',
              color: 'white',
              padding: '2px 8px',
              fontSize: '12px',
              fontWeight: '600',
              borderRadius: '4px',
              textTransform: 'capitalize'
            }}>
              {det.category}
            </span>
          </div>
        ))}
      </div>

      <button 
        onClick={onReset}
        style={{ marginTop: '1rem', padding: '8px 16px', background: '#eee', border: 'none', borderRadius: '20px', cursor: 'pointer' }}
      >
        Upload New Image
      </button>
    </div>
  );
}