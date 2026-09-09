import React, { useCallback, useEffect, useState, useRef } from 'react';
import './App.css';
import ImageUpload from './components/search/imageUpload';
import ImageCrop from './components/search/imageCrop';
import ResultGrid from './components/results/resultGrid';
import Header from './components/header/header';
import DetectionOverlay from './components/search/detectionOverlay';
import Canvas from './components/board/Canvas';
import { supabase } from './supabaseClient';
import { resizeImageBlob } from './utils/cropCanvas';

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

  // --- Web Worker for on-device embeddings ---
  const worker = useRef(null);
  const workerResolvers = useRef({});
  const [modelStatus, setModelStatus] = useState('unloaded'); // unloaded, loading, ready
  const [modelProgress, setModelProgress] = useState(0);

  // --- Wardrobe state ---
  const [wardrobe, setWardrobe] = useState(() => {
    const saved = localStorage.getItem('wardrobeItems');
    return saved ? JSON.parse(saved) : [];
  });
  const [toastMsg, setToastMsg] = useState(null);

  useEffect(() => {
    localStorage.setItem('wardrobeItems', JSON.stringify(wardrobe));
  }, [wardrobe]);

  // Initialize worker and start loading models on app launch
  useEffect(() => {
    worker.current = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });

    worker.current.addEventListener('message', (event) => {
      const { type, status, message, progress, id, error } = event.data;

      if (type === 'STATUS') {
        setModelStatus(status);
        if (status === 'loading' && message) console.log(message);
      } else if (type === 'PROGRESS') {
        if (progress && progress.progress) setModelProgress(progress.progress);
      } else if (type === 'RESULT' || type === 'ERROR') {
        if (id && workerResolvers.current[id]) {
          workerResolvers.current[id](event.data);
          delete workerResolvers.current[id];
        }
      }
    });

    // Start loading models in the background immediately
    worker.current.postMessage({ type: 'LOAD_MODELS' });

    return () => {
      if (worker.current) worker.current.terminate();
    };
  }, []);

  // Helper to call the worker for embedding generation
  const getEmbeddingFromWorker = (type, payload) => {
    return new Promise((resolve, reject) => {
      if (modelStatus !== 'ready') {
        reject(new Error("Please wait a moment."));
        return;
      }
      const id = Date.now().toString() + Math.random().toString();
      workerResolvers.current[id] = resolve;
      worker.current.postMessage({ type, payload, id });
    });
  };

  // --- UI helpers ---
  const handleUndoAdd = (prodNum) => {
    setWardrobe(prev => prev.filter(w => w.prod_num !== prodNum));
    setToastMsg(null);
  };

  const handleAddToBoard
   = (item) => {
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

  const handleNewImageSrc = useCallback((src) => {
    setDetections(null);
    setMode('crop');
    setImageSrc(src);
  }, []);

  const handleNewImageUrl = useCallback((url) => {
    setDetections(null);
    setMode('crop');
    setImageUrl(url);
  }, []);

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

  // Auto-detection triggered from the manual crop screen
  const runAutoDetect = useCallback(async () => {
    if (!imageSrc || isDetecting) return;
    setIsDetecting(true);
    try {
      const response = await fetch(imageSrc);
      const blob = await response.blob();
      const resizedBlob = await resizeImageBlob(blob, 1024);
      const objectUrl = URL.createObjectURL(resizedBlob);

      const workerRes = await getEmbeddingFromWorker('DETECT_IMAGE', { image: objectUrl });
      URL.revokeObjectURL(objectUrl);

      if (workerRes.type === 'RESULT' && workerRes.detections) {
        setDetections(workerRes.detections);
        setMode('detect');
      } else if (workerRes.type === 'ERROR') {
        setToastMsg({ text: 'Detection failed: ' + workerRes.error });
      }
    } catch (error) {
      console.error('Detection error:', error);
    } finally {
      setIsDetecting(false);
    }
  }, [imageSrc, isDetecting]);
const getSearchResultsUrl = async (url) => {
    setRateLimit(false);
    try {
      let workerRes;
      try {
        // Run inference completely on-device
        workerRes = await getEmbeddingFromWorker('EMBED_IMAGE', { image: url });
      } catch (err) {
        setToastMsg({ text: err.message });
        setSearchRes(null);
        return 'error';
      }

      if (workerRes.type === 'ERROR') {
        console.error("Worker error:", workerRes.error);
        return 'error';
      }

      // Call Supabase Postgres function directly
      const embeddingString = `[${Array.from(workerRes.embedding).join(',')}]`;

      // Call Supabase Postgres function directly
      const { data, error } = await supabase.rpc('find_sim_products', {
        query_embedding: embeddingString, // Pass the string instead of the array
        top_k: 20,
        ef_search: 64 
      });

      // ADD THIS LOG to verify what Supabase is doing
      console.log("Supabase RPC Response:", { data, error });

      if (error) {
        console.error('Supabase search error:', error);
        
        if (error.code === '429') {
          if (url) setImageUrl('');
          setRateLimit(true);
        }
        return 'error';
      }

      if (error) {
        console.error('Supabase search error:', error);
        
        // Supabase PostgREST returns a 429 code when API rate limits are hit
        if (error.code === '429') {
          if (url) setImageUrl('');
          setRateLimit(true);
        }
        return 'error';
      }

      // Supabase RPC returns the array of rows directly in `data`
      return data;
      
    } catch (error) {
      console.error('Error:', error);
      return 'error';
    }
  };

  const getSearchResultsImage = async (croppedBlob) => {
    setRateLimit(false);
    try {
      const resizedBlob = await resizeImageBlob(croppedBlob, 1024);
      const objectUrl = URL.createObjectURL(resizedBlob);
      let workerRes;
      try {
        workerRes = await getEmbeddingFromWorker('EMBED_IMAGE', { image: objectUrl });
      } catch (err) {
        setToastMsg({ text: err.message });
        URL.revokeObjectURL(objectUrl);
        setSearchRes(null);
        return 'error';
      }

      URL.revokeObjectURL(objectUrl);

      if (workerRes.type === 'ERROR') {
        console.error("Worker error:", workerRes.error);
        return 'error';
      }

      // Call Supabase Postgres function directly
      // Convert Float32Array directly into the string format pgvector expects
      const embeddingString = `[${Array.from(workerRes.embedding).join(',')}]`;

      // Call Supabase Postgres function directly
      const { data, error } = await supabase.rpc('find_sim_products', {
        query_embedding: embeddingString, // Pass the string instead of the array
        top_k: 20,
        ef_search: 64 
      });

      // ADD THIS LOG to verify what Supabase is doing
      console.log("Supabase RPC Response:", { data, error });

      if (error) {
        console.error('Supabase search error:', error);
        
        if (error.code === '429') {
          if (url) setImageUrl('');
          setRateLimit(true);
        }
        return 'error';
      }

      if (error) {
        console.error('Supabase search error:', error);
        
        if (error.code === '429') {
          // Assuming `imageSrc` is a state variable in your component
          URL.revokeObjectURL(imageSrc); 
          setImageSrc('');
          setRateLimit(true);
        }
        return 'error';
      }

      // Supabase RPC returns the array of rows directly in `data`
      return data;
      
    } catch (error) {
      console.error('Error:', error);
      return 'error';
    }
  };

  // Effects that trigger search when crop or URL changes
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

const handleFindSimilar = async (garmentId, url) => {
    skipUrlSearch.current = true;
    setImageSrc('');
    setCroppedImage(null);
    setImageUrl(url);

    setRateLimit(false);
    setSearchRes('loading');

    try {
      // Call Supabase function that searches directly by target garment UUID
      const { data, error } = await supabase.rpc('find_sim_products_by_id', {
        target_garment_id: garmentId,
        top_k: 20,
        ef_search: 200
      });

      console.log("Supabase Search-by-ID Response:", { data, error });

      if (error) {
        console.error('Supabase search-id error:', error);
        if (error.code === '429') {
          setRateLimit(true);
        }
        setSearchRes("error");
        return;
      }

      commitSearchResult(data, { gid: garmentId, url: url });
      setActiveTab('search');
    } catch (error) {
      console.error('Error:', error);
      setSearchRes("error");
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

      {/* Model loading indicator */}
      {/* {modelStatus === 'loading' && (
        <div style={{
          background: 'rgba(0,0,0,0.8)', color: '#fff', padding: '8px 16px',
          textAlign: 'center', fontSize: '13px', zIndex: 9999,
          position: 'fixed', top: '10px', left: '50%', transform: 'translateX(-50%)',
          borderRadius: '20px', backdropFilter: 'blur(4px)'
        }}>
          Downloading ... {Math.round(modelProgress)}%
        </div>
      )} */}

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
                setImageSrc={handleNewImageSrc}
                imageUrl={imageUrl}
                setImageUrl={handleNewImageUrl}
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