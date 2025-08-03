import React, { useCallback, useEffect, useState, useRef } from 'react'
import './App.css'
import ImageUpload from './components/imageUpload'
import ImageCrop from './components/imageCrop'
import ResultGrid from './components/resultGrid'
import Header from './components/header'
import { API_BASE } from './config'

function App() {
  const [imageSrc, setImageSrc] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  const [croppedImage, setCroppedImage] = useState(null)
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
  }, [imageSrc, imageUrl])


  useEffect(() => {
    const loadResultsForFile = async () => {
      if (croppedImage) {
        console.log("searching")
        setSearchRes("loading")
        const delay = new Promise(res => setTimeout(res, 3000))
        const dataFetch = getSearchResultsImage(croppedImage)
        const [data] = await Promise.all([dataFetch, delay])
        if (data == "error") {
          console.log("rate limit met")
          setSearchRes("error")
          setRateLimit(true)
        }
        setSearchRes(data)
      }
    }
    loadResultsForFile()
  }, [croppedImage, resetImageToCrop])


  useEffect(() => {
    const loadResultsForUrl = async () => {
      if (imageUrl) {
        console.log("searching")
        setSearchRes("loading")
        const delay = new Promise(res => setTimeout(res, 3000))
        const dataFetch = getSearchResultsUrl(imageUrl)
        const [data] = await Promise.all([dataFetch, delay])
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
      resetImageToCrop()
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

  return (
    <>
      <Header />
      <div className={searchRes ? 'with-result-container' : 'without-result-container'} ref={searchRes ? resultRef : null}>
        <div className={searchRes ? 'with-result-left' : ''}>
        
          {(imageToCrop && imageSrc) ? (
            <ImageCrop
              className="crop-or-upload"
              imageSrc={imageSrc || imageUrl}
              resetImage={resetImageToCrop}
              setCroppedImage={setCroppedImage}
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
