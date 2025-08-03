import CancelIcon from '@mui/icons-material/Cancel';
import ReactCrop from 'react-image-crop';
import React, { useState, useRef } from 'react'
import './imageCrop.css'
import 'react-image-crop/dist/ReactCrop.css';



export default function ImageCrop({ imageSrc, resetImage, setCroppedImage }) {
  const [crop, setCrop] = useState(null)
  const imgRef = useRef(null)

  const handleImageLoad = (e) => {
    imgRef.current = e.currentTarget

    setCrop({ unit: '%', x: 0, y: 0, width: 100, height: 100 })

  };
  async function getCroppedImage(image, crop, fileName) {
    const canvas = document.createElement('canvas')
    const scaleX = image.naturalWidth / image.width
    const scaleY = image.naturalHeight / image.height
    if (crop.unit === '%' && crop.x == 0 && crop.y === 0 && crop.width === 100 && crop.height === 100) {
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const ctx = canvas.getContext('2d')
      ctx.drawImage(image, 0, 0)
    }
    else {
      canvas.width = crop.width
      canvas.height = crop.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(image, crop.x * scaleX, crop.y * scaleY, crop.width * scaleX, crop.height * scaleY, 0, 0, crop.width, crop.height)
    }

    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            console.error("canvas is empty")
            return;
          }
          blob.name = fileName
          resolve(blob)
        },
        'image/jpeg', 0.5
      )
    })

  }
  const handleSearch = async () => {
    if (!crop || !imgRef.current) {
      return;
    }
    const croppedBlob = await (getCroppedImage(imgRef.current, crop, 'cropped.jpeg'))
    console.log("cropped image saved")
    setCroppedImage(croppedBlob)
    resetImage()
  }

  return (<div className="image-crop-container">
    <p className="crop-title">Crop to fit item</p>
    <div className="crop-wrapper">
      <CancelIcon onClick={resetImage} className="close-icon" />
      <ReactCrop className="react-crop-custom" crop={crop} onChange={setCrop} objectFit="contain" zoom={1}>
        <img src={imageSrc} onLoad={handleImageLoad} />
      </ReactCrop>
    </div>
    <button onClick={handleSearch} className="search-button">Search</button>
  </div>
  )
}