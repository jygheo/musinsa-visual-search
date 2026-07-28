import React, { useCallback, useEffect, useState, useRef } from 'react'
import './App.css'
import ImageUpload from './components/imageUpload'
import ImageCrop from './components/imageCrop'
import ResultGrid from './components/resultGrid'
import Header from './components/header'
import DetectionOverlay from './components/detectionOverlay'
import { API_BASE } from './config'

function App() {
  const [imageSrc, setImageSrc] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  const [croppedImage, setCroppedImage] = useState(null)
  
  const [detections, setDetections] = useState(null)
  const [isDetecting, setIsDetecting] = useState(false)
  const [showManualCrop, setShowManualCrop] = useState(false)

  const [searchRes, setSearchRes] = useState(null)
  const [rateLimit, setRateLimit] = useState(false)
  const imageToCrop = imageSrc || imageUrl
  const resultRef = useRef(null)

  const resetImageToCrop = useCallback(() => {
    if (imageSrc) {
      setImageSrc("")
      URL.revokeObjectURL(imageSrc)
    }
    if (imageUrl) {
      setImageUrl("")
    }
    setDetections(null)
    setCroppedImage(null)
    setShowManualCrop(false)
  }, [imageSrc, imageUrl])


  useEffect(() => {
    const runDetection = async () => {
      if (imageSrc && !detections && !isDetecting) {
        setIsDetecting(true)
        
        try {
            // Fetch the image as a blob to send to the backend
            const response = await fetch(imageSrc);
            const blob = await response.blob();
            
            const formData = new FormData()
            formData.append('file', blob)
            
            const detectRes = await fetch(`${API_BASE}/detect`, { method: 'POST', body: formData })
            if (detectRes.ok) {
                const data = await detectRes.json()
                setDetections(data.detections || [])
            }
        } catch (error) {
            console.error('Detection error:', error)
        } finally {
            setIsDetecting(false)
        }
      }
    }
    
    runDetection()
  }, [imageSrc, detections, isDetecting])
  
  useEffect(() => {
    const loadResultsForFile = async () => {
      if (croppedImage) {
        console.log("searching file")
        setSearchRes("loading")
        const data = await getSearchResultsImage(croppedImage)

        if (data == "error") {
          console.log("rate limit met")
          setSearchRes("error")
          setRateLimit(true)
        }
        setSearchRes(data)
      }
    }
    loadResultsForFile()
  }, [croppedImage])


  useEffect(() => {
    const loadResultsForUrl = async () => {
      if (imageUrl) {
        console.log("searching")
        setSearchRes("loading")
        const data = await getSearchResultsUrl(imageUrl)
        if (data == "error") {
          console.log("rate limit met")
          setSearchRes("error")
          setRateLimit(true)
        }
        setSearchRes(data)
      }
    }
    loadResultsForUrl()
  }, [imageUrl, resetImageToCrop])

  const getSearchResultsUrl = async (imageUrl) => {
    setRateLimit(false)
    const formData = new FormData()
    formData.append('image_url', imageUrl)
    try {
      const response = await fetch(`${API_BASE}/search-url`, { method: 'POST', body: formData })
      if (response.status === 429) {
        setImageUrl("")
        return ["error"]
      }
      const data = await response.json()

      resetImageToCrop()
      return (data.results)
    }
    catch (error) {
      console.error('Error submitting form:', error)
    }
  }

  const getSearchResultsImage = async (croppedBlob) => {
    setRateLimit(false)
    console.log('Sending image to API:', croppedBlob)
    console.log('Blob URL:', URL.createObjectURL(croppedBlob))
    const formData = new FormData()
    formData.append('file', croppedBlob)
    try {
      const response = await fetch(`${API_BASE}/search-file`, { method: 'POST', body: formData })
      if (response.status === 429) {
        URL.revokeObjectURL(imageSrc)
        setImageSrc("")
        return ["error"]
      }
      const data = await response.json()
      return (data.results)
    }
    catch (error) {
      console.error('Error submitting form:', error);
    }
  }

  useEffect(() => {
    if (searchRes && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [searchRes])

  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, [])

  const searchFullImage = async () => {
    if (!imageSrc) return;
    try {
      const response = await fetch(imageSrc);
      const blob = await response.blob();
      setCroppedImage(blob);
    } catch (error) {
      console.error("Failed to fetch full image blob:", error);
    }
  }

  return (
    <>
      <Header />
      <div className={searchRes ? 'with-result-container' : 'without-result-container'} ref={searchRes ? resultRef : null}>
        <div className={searchRes ? 'with-result-left' : ''}>
        
          {}
          {isDetecting ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>Detecting items...</div>
          ) : showManualCrop ? (
            <ImageCrop
              imageSrc={imageSrc}
              setCroppedImage={(img) => {
                setCroppedImage(img);
                setShowManualCrop(false);
              }}
              onCancel={() => setShowManualCrop(false)}
              onReset={resetImageToCrop}
            />
          ) : (imageToCrop && imageSrc && detections) ? (
            <DetectionOverlay
              imageSrc={imageSrc}
              detections={detections}
              onSelectCrop={setCroppedImage}
              onReset={resetImageToCrop}
              onSearchFull={searchFullImage}
              onManualCrop={() => setShowManualCrop(true)}
            />
          ) : (
            <ImageUpload
              className="crop-or-upload"
              imageSrc={imageSrc}
              setImageSrc={setImageSrc}
              imageUrl={imageUrl}
              setImageUrl={setImageUrl}
              setCroppedImage={setCroppedImage}
              setImageToCrop={resetImageToCrop}
            />
          )}

        </div>
        {(rateLimit || searchRes) && (
          <div className="with-result-right">
            {(rateLimit) && <div className="rate-limit-message">Try again later</div>}
            <ResultGrid className=""
              searchRes={searchRes}
            />
          </div>
        )}
      </div>
      <div className='extender'></div>
    </>
  );

}

export default App;
