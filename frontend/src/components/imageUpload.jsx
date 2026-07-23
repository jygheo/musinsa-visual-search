import React, { useState } from 'react'
import SearchIcon from '@mui/icons-material/Search'
import ImageIcon from '@mui/icons-material/Image'
import CloseIcon from '@mui/icons-material/Close'
import './imageUpload.css'

const maxSize = 20 * 1024 * 1024
export default function ImageUpload({ setImageSrc, setImageUrl, setCroppedImage }) {
  const fileInputRef = React.useRef(null)
  const urlInputRef = React.useRef(null)
  const [errorMessage, setErrorMessage] = useState("")
  const handleUploadClick = (e) => {
    e.preventDefault()
    fileInputRef.current.click()

  }
  const validateFile = (file) => {
    const isImage = file.type.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp)$/i.test(file.name)
    if (!isImage) {
      setErrorMessage("File is not an image")
      return false
    }
    if (file.size > maxSize) {
      setErrorMessage("Image size is greater than 20MB")
      return false
    }
    setErrorMessage('')
    return true

  }

  const handleFileChange = (e) => {
    setErrorMessage('')
    const file = e.target.files[0]
    if (file && validateFile(file)) {
      setCroppedImage(null)
      setImageSrc(URL.createObjectURL(file))
      console.log("file changed")
    }
  }

  const [tempImageUrl, setTempImageUrl] = useState("")
  const handleUrlChange = (e) => {
    setTempImageUrl(e.target.value)

  }
  const validateUrl = (url) => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(true)
      img.onerror = () => reject(false)
      img.src = url

    })

  }

  const handleEnter = (e) => {
    if (e.key === 'Enter') {
      setErrorMessage('')
      e.preventDefault()
      const url = e.target.value

      validateUrl(url)
        .then(() => {
          setCroppedImage(null)
          setImageUrl(url)
        })
        .catch(() => setErrorMessage("Pasted URL is not an image"))
    }
  }

  const handleSearchButton = (e) => {
    e.preventDefault()
    setErrorMessage('')
    const url = urlInputRef.current.value

    validateUrl(url)
      .then(() => {
        setCroppedImage(null)
        setImageUrl(url)
      })
      .catch(() => setErrorMessage("Pasted URL is not an image"))

  }

  const [isDragged, setisDragged] = useState(false)

  const handleDragEnter = (e) => {
    e.preventDefault()
    setisDragged(true)

  }
  const handleDragOver = (e) => {
    e.preventDefault()

  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setisDragged(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setisDragged(false)
    setErrorMessage('')

    const items = e.dataTransfer.items
    if (!items || items.length === 0) {
      setErrorMessage("No file found in drop")
      return
    }
    const item = items[0]
    if (item.kind === "file") {
      const file = item.getAsFile()
      if (file && validateFile(file)) {
        setCroppedImage(null)
        console.log("Dropped a file")
        setImageSrc(URL.createObjectURL(file))
        return
      }
    }
    else if (item.kind === "string" && item.type === "text/uri-list") {
      item.getAsString((url) => {
        setErrorMessage('')
        validateUrl(url)
          .then(() => {
            setCroppedImage(null)
            console.log("drop successful")
            setImageUrl(url)
          })
          .catch(() =>setErrorMessage("Dropped file is not an image")) 
      })
      return
    }
    else { setErrorMessage("Dropped file is not an image") }
  }



  const handleCloseError = () => {
    setErrorMessage('')
  }

  return (
    <div className="image-upload-container">
      {errorMessage && (
        <div className={"error-message"}>
          <span>{errorMessage}</span>
          <CloseIcon onClick={handleCloseError} className="close-icon" />
        </div>
      )}

      <form className="upload-form">
        <input
          type="file"
          id="imgFile"
          ref={fileInputRef}
          name="img"
          className="hidden-input"
          onChange={handleFileChange}
          accept="image/*"
        />

        <div className="upload-section">
          <div
            className={`drag-zone ${isDragged ? 'drag-zone-on' : ''}`}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDragLeave={handleDragLeave}
            onClick={handleUploadClick}
          >
            <ImageIcon className="upload-icon" />
            <p className="upload-text">
              Drop your image here, or <span className="fake-link">browse</span>
            </p>
            <small className="file-hint">Maximum file size: 20MB</small>
          </div>

          <div className="line-container">
            <div className="line" />
            <span className="line-text">OR</span>
            <div className="line" />
          </div>

          <div className="search-wrapper">
            <div className="url-input-wrapper">
              <span className="icon"><SearchIcon /></span>
              <input
                id="url"
                type="url"
                name="url"
                ref={urlInputRef}
                placeholder="Paste Image URL"
                onChange={handleUrlChange}
                onKeyDown={handleEnter}
                value={tempImageUrl}
                className="url-input"
              />
            </div>
            <button className="url-search-button" onClick={handleSearchButton}>Search</button>
          </div>

        </div>
      </form>
    </div>
  )
}