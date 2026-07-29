import React, { useCallback, useEffect, useState, useRef } from 'react';
import './App.css';
import ImageUpload from './components/search/imageUpload';
import ImageCrop from './components/search/imageCrop';
import ResultGrid from './components/results/ResultGrid';
import Header from './components/header/header';
import DetectionOverlay from './components/search/detectionOverlay';
import Canvas from './components/board/Canvas';
import { API_BASE } from './config';

function App() {
  const [imageSrc, setImageSrc] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [croppedImage, setCroppedImage] = useState(null);

  const [detections, setDetections] = useState(null);
  const [isDetecting, setIsDetecting] = useState(false);
  // 'crop' = manual crop tool (default landing after upload), 'detect' = auto-detected tags overlay
  const [mode, setMode] = useState('crop');

  const [searchRes, setSearchRes] = useState(null);
  const [rateLimit, setRateLimit] = useState(false);

  const [previewImage, setPreviewImage] = useState('');

  const [activeTab, setActiveTab] = useState('search');

  const imageToCrop = imageSrc || imageUrl;
  const resultRef = useRef(null);
  const skipUrlSearch = useRef(false);

  const [wardrobe, setWardrobe] = useState(() => {
    const saved = localStorage.getItem('wardrobeItems');
    return saved ? JSON.parse(saved) : [];
  });
  const [toastMsg, setToastMsg] = useState(null);

  useEffect(() => {
    localStorage.setItem('wardrobeItems', JSON.stringify(wardrobe));
  }, [wardrobe]);

  const handleUndoAdd = (prodNum) => {
    setWardrobe(prev => prev.filter(w => w.prod_num !== prodNum));
    setToastMsg(null);
  };

  const handleAddToBoard = (item) => {
    setWardrobe(prev => {
      if (prev.some(w => w.prod_num === item.prod_num)) return prev;

      let startY = window.innerHeight / 2 - 150;
      let startZ = prev.length + 10;
      const cat = (item.category || '').toLowerCase();

      if (cat.includes('bottom') || cat.includes('pants') || cat.includes('skirt')) {
        startY += 180;
        startZ = prev.length + 5;
      } else if (cat.includes('shoe') || cat.includes('footwear')) {
        startY += 320;
        startZ = prev.length + 0;
      } else if (cat.includes('top') || cat.includes('shirt')) {
        startY -= 60;
        startZ = prev.length + 10;
      } else if (cat.includes('outerwear') || cat.includes('jacket') || cat.includes('coat')) {
        startY -= 80;
        startZ = prev.length + 15;
      } else if (cat.includes('headwear') || cat.includes('hat')) {
        startY -= 220;
        startZ = prev.length + 20;
      }

      return [...prev, {
        ...item,
        canvas_x: window.innerWidth / 2 - 100 + (Math.random() * 40 - 20),
        canvas_y: startY + (Math.random() * 30 - 15),
        canvas_scale: 1.0,
        canvas_rotation: 0,
        z_index: startZ,
        flip_x: 1
      }];
    });

    setToastMsg({ text: 'Added to your board', prod_num: item.prod_num });

    if (window.toastTimer) clearTimeout(window.toastTimer);
    window.toastTimer = setTimeout(() => setToastMsg(null), 4000);
  };

  useEffect(() => {
    if (croppedImage) {
      const url = URL.createObjectURL(croppedImage);
      setPreviewImage(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreviewImage('');
    }
  }, [croppedImage]);

  const goHome = useCallback(() => {
    if (imageSrc) URL.revokeObjectURL(imageSrc);
    setImageSrc('');
    setImageUrl('');
    setCroppedImage(null);
    setDetections(null);
    setMode('crop');
    setSearchRes(null);
    setRateLimit(false);
    setActiveTab('search');
    const url = new URL(window.location);
    url.search = '';
    window.history.pushState({ isInitial: true }, '', url);
  }, [imageSrc]);

  const clearSourceAfterSearch = useCallback(() => {
    if (imageSrc) URL.revokeObjectURL(imageSrc);
    setImageSrc('');
    setDetections(null);
    setMode('crop');
  }, [imageSrc]);

  const resetImageToCrop = useCallback(() => {
    if (imageSrc) {
      setImageSrc('');
      URL.revokeObjectURL(imageSrc);
    }
    if (imageUrl) setImageUrl('');
    setDetections(null);
    setCroppedImage(null);
    setMode('crop');
  }, [imageSrc, imageUrl]);

  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  const commitSearchResult = useCallback((data, params) => {
    setSearchRes(data);
    if (Array.isArray(data)) {
      const url = new URL(window.location);
      url.search = '';
      if (params.url) url.searchParams.set('url', params.url);
      if (params.gid) url.searchParams.set('gid', params.gid);
      if (params.file) url.searchParams.set('type', 'file');

      window.history.pushState({
        searchRes: data,
        imageUrl: params.url || "",
        gid: params.gid || "",
        isFile: !!params.file
      }, '', url);
    }
  }, []);

  useEffect(() => {
    window.history.replaceState({ isInitial: true }, '');
    const handlePopState = (event) => {
      if (event.state && event.state.searchRes) {
        skipUrlSearch.current = true;
        if (event.state.imageUrl) {
           setImageUrl(event.state.imageUrl);
           setImageSrc("");
           setCroppedImage(null);
        } else if (!event.state.isFile) {
           setImageUrl("");
        }
        setSearchRes(event.state.searchRes);
        setRateLimit(false);
        setActiveTab('search');
      } else if (event.state && event.state.isInitial) {
        setSearchRes(null);
        setImageUrl("");
        setImageSrc("");
        setCroppedImage(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Auto-detection is now opt-in: triggered from the manual crop screen via
  // the "Auto-detect items" button, rather than firing automatically on upload.
  const runAutoDetect = useCallback(async () => {
    if (!imageSrc || isDetecting) return;
    setIsDetecting(true);
    try {
      const response = await fetch(imageSrc);
      const blob = await response.blob();
      const formData = new FormData();
      formData.append('file', blob);

      const detectRes = await fetch(`${API_BASE}/detect`, {
        method: 'POST',
        body: formData,
      });
      if (detectRes.ok) {
        const data = await detectRes.json();
        setDetections(data.detections || []);
        setMode('detect');
      }
    } catch (error) {
      console.error('Detection error:', error);
    } finally {
      setIsDetecting(false);
    }
  }, [imageSrc, isDetecting]);

  useEffect(() => {
    const loadResultsForFile = async () => {
      if (croppedImage) {
        setSearchRes('loading');
        const data = await getSearchResultsImage(croppedImage);
        if (data === "error") {
          setSearchRes("error");
          setRateLimit(true);
        } else {
          commitSearchResult(data, { file: true });
        }
      }
    };
    loadResultsForFile();
  }, [croppedImage]);

  useEffect(() => {
    const loadResultsForUrl = async () => {
      if (imageUrl) {
        if (skipUrlSearch.current) {
          skipUrlSearch.current = false;
          return;
        }
        setSearchRes('loading');
        const data = await getSearchResultsUrl(imageUrl)
        if (data === "error") {
          setSearchRes("error");
          setRateLimit(true);
        } else {
          commitSearchResult(data, { url: imageUrl });
        }
      }
    };
    loadResultsForUrl();
  }, [imageUrl, resetImageToCrop]);

  const getSearchResultsUrl = async (url) => {
    setRateLimit(false);
    const formData = new FormData();
    if (url) formData.append('image_url', url);
    try {
      const response = await fetch(`${API_BASE}/search-url`, { method: 'POST', body: formData });
      if (response.status === 429) {
        if (url) setImageUrl('');
        return 'error';
      }
      const data = await response.json();
      return data.results;
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const getSearchResultsImage = async (croppedBlob) => {
    setRateLimit(false);
    const formData = new FormData();
    if (croppedBlob) formData.append('file', croppedBlob);
    try {
      const response = await fetch(`${API_BASE}/search-file`, { method: 'POST', body: formData });
      if (response.status === 429) {
        URL.revokeObjectURL(imageSrc);
        setImageSrc('');
        return 'error';
      }
      const data = await response.json();
      return data.results;
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const handleFindSimilar = async (garmentId, url) => {
    skipUrlSearch.current = true;
    setImageSrc('');
    setCroppedImage(null);
    setImageUrl(url);

    setRateLimit(false);
    setSearchRes('loading');

    const formData = new FormData();
    formData.append('garment_id', garmentId);

    try {
      const response = await fetch(`${API_BASE}/search-id`, { method: 'POST', body: formData });
      if (response.status === 429) {
        setSearchRes("error");
        setRateLimit(true);
        return;
      }
      const data = await response.json();
      commitSearchResult(data.results, { gid: garmentId, url: url });
      setActiveTab('search');
    } catch (error) {
      console.error('Error:', error);
    }
  };

  useEffect(() => {
    if (searchRes && resultRef.current && activeTab === 'search') {
      resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [searchRes, activeTab]);

  const searchFullImage = async () => {
    if (!imageSrc) return;
    try {
      const response = await fetch(imageSrc);
      const blob = await response.blob();
      setCroppedImage(blob);
    } catch (error) {
      console.error('Failed to fetch full image blob:', error);
    }
  };

  return (
    <>
      <Header
        wardrobeCount={wardrobe.length}
        activeTab={activeTab}
        onToggleTab={() => setActiveTab(prev => (prev === 'search' ? 'board' : 'search'))}
        onGoHome={goHome}
        showHome={true}
      />

      {activeTab === 'search' ? (
        <div
          className={searchRes ? 'with-result-container' : 'without-result-container'}
          ref={searchRes ? resultRef : null}
        >
          <div className={searchRes ? 'with-result-left' : 'state-ab-layout'}>
            {imageToCrop && imageSrc && mode === 'detect' && detections ? (
              <DetectionOverlay
                imageSrc={imageSrc}
                detections={detections}
                isDetecting={isDetecting}
                onSelectCrop={setCroppedImage}
                onReset={resetImageToCrop}
                onSearchFull={searchFullImage}
                onManualCrop={() => setMode('crop')}
              />
            ) : imageSrc ? (
              <ImageCrop
                imageSrc={imageSrc}
                setCroppedImage={img => setCroppedImage(img)}
                resetImage={resetImageToCrop}
                clearSource={clearSourceAfterSearch}
                onAutoDetect={runAutoDetect}
                isDetecting={isDetecting}
              />
            ) : (!imageSrc && imageUrl) ? (
              <div className="reference-card">
                <span className="reference-tag">Finding similar to</span>
                <div className="reference-image-frame">
                  <img
                    src={imageUrl}
                    alt="Reference Garment"
                    className="reference-image"
                  />
                </div>
                <button className="reference-clear-btn" onClick={resetImageToCrop}>
                  Clear &amp; upload new
                </button>
              </div>
            ) : (!imageSrc && !imageUrl && previewImage) ? (
              <div className="reference-card">
                <span className="reference-tag">Your search image</span>
                <div className="reference-image-frame">
                  <img
                    src={previewImage}
                    alt="Cropped search"
                    className="reference-image"
                  />
                </div>
                <button className="reference-clear-btn" onClick={resetImageToCrop}>
                  Clear &amp; upload new
                </button>
              </div>
            ) : (
              <ImageUpload
                imageSrc={imageSrc}
                setImageSrc={setImageSrc}
                imageUrl={imageUrl}
                setImageUrl={setImageUrl}
                setCroppedImage={setCroppedImage}
              />
            )}
          </div>

          {(rateLimit || searchRes) && (
            <div className="with-result-right">
              {rateLimit && <div className="rate-limit-message">Try again later</div>}

              <ResultGrid
                searchRes={searchRes}
                onFindSimilar={handleFindSimilar}
                onAddToBoard={handleAddToBoard}
              />
            </div>
          )}
        </div>
      ) : (
        <Canvas wardrobe={wardrobe} setWardrobe={setWardrobe} />
      )}

      {toastMsg && (
        <div className="toast-notification">
          <span>{toastMsg.text}</span>
          <button
            className="toast-undo-btn"
            onClick={() => handleUndoAdd(toastMsg.prod_num)}
          >
            Undo
          </button>
        </div>
      )}

      <div className="extender"></div>
    </>
  );
}

export default App;