export const getCroppedImgBlob = async (imageElement, crop, fileName = 'cropped.jpeg', isNormalized = false) => {
  const canvas = document.createElement('canvas');
  const scaleX = imageElement.naturalWidth / imageElement.width;
  const scaleY = imageElement.naturalHeight / imageElement.height;

  let cropX, cropY, cropW, cropH;

  // Handle YOLO detections (0-1 normalized values) vs ReactCrop (pixels or %)
  if (isNormalized) {
    cropX = crop.x * imageElement.naturalWidth;
    cropY = crop.y * imageElement.naturalHeight;
    cropW = crop.w * imageElement.naturalWidth;
    cropH = crop.h * imageElement.naturalHeight;
  } else if (crop.unit === '%' && crop.x === 0 && crop.y === 0 && crop.width === 100 && crop.height === 100) {
    cropX = 0;
    cropY = 0;
    cropW = imageElement.naturalWidth;
    cropH = imageElement.naturalHeight;
  } else {
    cropX = crop.x * scaleX;
    cropY = crop.y * scaleY;
    cropW = crop.width * scaleX;
    cropH = crop.height * scaleY;
  }

  canvas.width = cropW;
  canvas.height = cropH;
  const ctx = canvas.getContext('2d');
  
  ctx.drawImage(imageElement, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          console.error("canvas is empty");
          resolve(null);
          return;
        }
        blob.name = fileName;
        resolve(blob);
      },
      'image/jpeg',
      0.9
    );
  });
};

export const resizeImageBlob = (source, maxDim = 1024, quality = 0.9) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);

      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('resize failed')); return; }
        resolve(blob);
      }, 'image/jpeg', quality);
    };
    img.onerror = reject;
    img.src = typeof source === 'string' ? source : URL.createObjectURL(source);
  });
};