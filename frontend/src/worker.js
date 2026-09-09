// ============================================================
// 1. IMPORTS
// ============================================================
import * as ort from 'onnxruntime-web';

// ============================================================
// 2. PATCH FETCH *BEFORE* ANY OTHER IMPORT
// ============================================================
const _origFetch = self.fetch;
self.fetch = async (...args) => {
    let reqUrl = args[0] instanceof Request ? args[0].url : args[0];

    const res = await _origFetch(...args);

    // --- Intercept and fix preprocessor_config.json ---
    if (typeof reqUrl === 'string' && reqUrl.includes('preprocessor_config.json') && res.ok) {
        try {
            const config = await res.clone().json();
            config.image_processor_type = 'CLIPFeatureExtractor';
            config.feature_extractor_type = 'CLIPFeatureExtractor';
            config.do_convert_rgb = false;

            // Normalize 'size'
            if (typeof config.size === 'number') {
                config.size = { height: config.size, width: config.size };
            } else if (config.size && config.size.shortest_edge) {
                config.size = { height: config.size.shortest_edge, width: config.size.shortest_edge };
            }

            // Normalize 'crop_size'
            if (typeof config.crop_size === 'number') {
                config.crop_size = { height: config.crop_size, width: config.crop_size };
            } else if (config.crop_size && config.crop_size.shortest_edge) {
                config.crop_size = { height: config.crop_size.shortest_edge, width: config.crop_size.shortest_edge };
            }

            // Disable built‑in resize/crop (we'll do it manually)
            config.do_resize = false;
            config.do_center_crop = false;

            console.log('[CONFIG PATCH] Rewrote preprocessor_config.json:', config);
            return new Response(JSON.stringify(config), {
                status: 200,
                headers: { 'content-type': 'application/json' }
            });
        } catch (e) {
            console.error("Failed to patch config on the fly:", e);
        }
    }

    // --- SPA fallback: return 404 for HTML (prevents Vite from serving index.html) ---
    const contentType = res.headers.get('content-type');
    if (res.ok && contentType && contentType.includes('text/html')) {
        console.warn('[SPA FALLBACK DETECTED]', reqUrl);
        return new Response('File not found', { status: 404 });
    }

    return res;
};

// ============================================================
// 3. CLEAR CACHE STORAGE
// ============================================================
(async function purgeCache() {
    if (self.caches) {
        const keys = await self.caches.keys();
        if (keys.length) {
            console.log('[CACHE PURGE] Deleting cache stores:', keys);
            await Promise.all(keys.map(k => self.caches.delete(k)));
        }
    }
})();

// ============================================================
// 4. DYNAMIC IMPORT + CONFIGURE TRANSFORMERS & ORT
// ============================================================
let env, AutoProcessor, CLIPVisionModelWithProjection, RawImage, Tensor;
let clipProcessor = null;
let clipVisionModel = null;
let yoloSession = null;

const ready = (async () => {
    const module = await import('@huggingface/transformers');
    env = module.env;
    AutoProcessor = module.AutoProcessor;
    CLIPVisionModelWithProjection = module.CLIPVisionModelWithProjection;
    RawImage = module.RawImage;
    Tensor = module.Tensor; // Use HF Tensor class for CLIP

    // Transformers.js config
    env.allowLocalModels = true;
    env.allowRemoteModels = false;
    env.localModelPath = self.location.origin + '/models/';
    env.useBrowserCache = false;
    env.useFSCache = false;
    env.backends.onnx.wasm.wasmPaths = self.location.origin + '/ort/';
    env.backends.onnx.wasm.numThreads = 1;

    // ONNX Runtime Web config (for YOLO)
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.simd = true;
    ort.env.wasm.wasmPaths = self.location.origin + '/ort/';
})();

// ============================================================
// 5. YOLO HELPER FUNCTIONS
// ============================================================
function calculateIou(box1, box2) {
    const x1_inter = Math.max(box1[0], box2[0]);
    const y1_inter = Math.max(box1[1], box2[1]);
    const x2_inter = Math.min(box1[2], box2[2]);
    const y2_inter = Math.min(box1[3], box2[3]);
    if (x2_inter < x1_inter || y2_inter < y1_inter) return 0.0;
    const inter = (x2_inter - x1_inter) * (y2_inter - y1_inter);
    const area1 = (box1[2]-box1[0]) * (box1[3]-box1[1]);
    const area2 = (box2[2]-box2[0]) * (box2[3]-box2[1]);
    return inter / (area1 + area2 - inter);
}

function mergeBoxes(box1, box2) {
    return [
        Math.min(box1[0], box2[0]), Math.min(box1[1], box2[1]),
        Math.max(box1[2], box2[2]), Math.max(box1[3], box2[3])
    ];
}

function consolidateDetections(detections, iouThreshold=0.15, distanceThreshold=0.3) {
    let grouped = {};
    for (let det of detections) {
        if (!grouped[det.category]) grouped[det.category] = [];
        grouped[det.category].push(det);
    }
    let finalArr = [];
    for (let cat in grouped) {
        let items = grouped[cat];
        while (items.length > 0) {
            let cur = items.shift();
            let cb = cur.raw_box;
            let merged = false;
            for (let i=0; i<items.length; i++) {
                let ob = items[i].raw_box;
                let x_dist = Math.max(0, Math.max(cb[0], ob[0]) - Math.min(cb[2], ob[2]));
                let y_dist = Math.max(0, Math.max(cb[1], ob[1]) - Math.min(cb[3], ob[3]));
                if (calculateIou(cb, ob) > iouThreshold || (x_dist < distanceThreshold && y_dist < distanceThreshold)) {
                    let nb = mergeBoxes(cb, ob);
                    items.splice(i, 1);
                    items.push({
                        raw_box: nb,
                        bbox: { x: nb[0], y: nb[1], w: nb[2]-nb[0], h: nb[3]-nb[1] },
                        category: cat
                    });
                    merged = true;
                    break;
                }
            }
            if (!merged) finalArr.push(cur);
        }
    }
    return finalArr;
}

// ============================================================
// 6. MESSAGE HANDLER
// ============================================================
self.addEventListener('message', async (event) => {
    await ready;

    const { type, payload, id } = event.data;

    if (type === 'LOAD_MODELS') {
        try {
            // ---- Load CLIP ----
            if (!clipProcessor || !clipVisionModel) {
                self.postMessage({ type: 'STATUS', status: 'loading', message: 'Loading FashionCLIP vision model...' });

                clipProcessor = await AutoProcessor.from_pretrained('fashion_clip_vision_only');
                clipVisionModel = await CLIPVisionModelWithProjection.from_pretrained('fashion_clip_vision_only', {
                    quantized: true,
                });

                self.postMessage({ type: 'STATUS', status: 'ready', message: 'CLIP loaded successfully!' });
            }

            // ---- Load YOLO ----
            if (!yoloSession) {
                self.postMessage({ type: 'STATUS', status: 'loading', message: 'Loading YOLOv8...' });

                yoloSession = await ort.InferenceSession.create(
                    self.location.origin + '/models/yolo_segment_new_int8.onnx',
                    { executionProviders: ['wasm'] }
                );

                self.postMessage({ type: 'STATUS', status: 'ready', message: 'YOLO loaded successfully!' });
            }

            self.postMessage({ type: 'STATUS', status: 'ready', message: 'All models loaded!' });
        } catch (error) {
            console.error("Worker Model Load Error:", error);
            self.postMessage({ type: 'ERROR', error: error.message });
        }
    }

    else if (type === 'EMBED_IMAGE') {
        try {
            if (!clipVisionModel) {
                throw new Error('Models not loaded yet. Send LOAD_MODELS first.');
            }

            // 1. Load the image and draw to offscreen canvas
            const rawImage = await RawImage.read(payload.image);
            const canvas = rawImage.toCanvas();

            const TARGET = 224;
            const scale = TARGET / Math.min(canvas.width, canvas.height);
            const resizedW = Math.round(canvas.width * scale);
            const resizedH = Math.round(canvas.height * scale);

            const offscreen = new OffscreenCanvas(TARGET, TARGET);
            const ctx = offscreen.getContext('2d');

            const left = Math.floor((resizedW - TARGET) / 2);
            const top = Math.floor((resizedH - TARGET) / 2);

            ctx.drawImage(
                canvas,
                0, 0, canvas.width, canvas.height,
                -left, -top, resizedW, resizedH
            );

            const imageData = ctx.getImageData(0, 0, TARGET, TARGET);
            const data = imageData.data;

            // 2. Normalization Constants for FashionCLIP
            const MEAN = [0.48145466, 0.4578275, 0.40821073];
            const STD = [0.26862954, 0.26130258, 0.27577711];

            // 3. Convert RGBA to Channel-First (CHW) Float32Array
            const float32Data = new Float32Array(3 * TARGET * TARGET);
            for (let i = 0; i < TARGET * TARGET; i++) {
                const r = data[i * 4];
                const g = data[i * 4 + 1];
                const b = data[i * 4 + 2];

                float32Data[i] = (r / 255.0 - MEAN[0]) / STD[0];
                float32Data[TARGET * TARGET + i] = (g / 255.0 - MEAN[1]) / STD[1];
                float32Data[2 * TARGET * TARGET + i] = (b / 255.0 - MEAN[2]) / STD[2];
            }

            // 4. Run HF model directly via HF Tensor
            const pixel_values = new Tensor('float32', float32Data, [1, 3, TARGET, TARGET]);
            const results = await clipVisionModel({ pixel_values });
            
            const outputTensor = results.image_embeds || Object.values(results)[0];
            const embedData = outputTensor.data;

            // 5. L2 Normalize
            let norm = 0;
            for (let i = 0; i < embedData.length; i++) norm += embedData[i] * embedData[i];
            norm = Math.sqrt(norm);
            const embedding = Array.from(embedData).map(val => val / norm);

            self.postMessage({ type: 'RESULT', id, embedding });
        } catch (error) {
            console.error("Worker Image Embed Error:", error);
            self.postMessage({ type: 'ERROR', id, error: error.message });
        }
    }

    else if (type === 'DETECT_IMAGE') {
        try {
            if (!yoloSession) {
                throw new Error('YOLO model not loaded yet. Send LOAD_MODELS first.');
            }

            // 1. Load image and draw to OffscreenCanvas (640x640)
            const rawImage = await RawImage.read(payload.image);
            const canvas = rawImage.toCanvas();

            const yoloCanvas = new OffscreenCanvas(640, 640);
            const ctx = yoloCanvas.getContext('2d');
            ctx.drawImage(canvas, 0, 0, 640, 640);
            const imgData = ctx.getImageData(0, 0, 640, 640).data;

            // 2. Convert RGBA to Float32 NCHW tensor
            const input = new Float32Array(3 * 640 * 640);
            for (let i = 0; i < 640 * 640; i++) {
                input[i] = imgData[i * 4] / 255.0;                     // R
                input[i + 640 * 640] = imgData[i * 4 + 1] / 255.0;    // G
                input[i + 2 * 640 * 640] = imgData[i * 4 + 2] / 255.0; // B
            }

            const tensor = new ort.Tensor('float32', input, [1, 3, 640, 640]);
            const results = await yoloSession.run({ [yoloSession.inputNames[0]]: tensor });

            const out = results[yoloSession.outputNames[0]].data;
            const numAnchors = 8400;

            // Determine if model is segmentation (has extra outputs)
            const isSegment = yoloSession.outputNames.length > 1;
            const numClasses = isSegment ? (out.length / numAnchors) - 36 : (out.length / numAnchors) - 4;

            // Parse class names from metadata if available
            let classNames = {};
            if (yoloSession.modelMetadata && yoloSession.modelMetadata.customMetadata && yoloSession.modelMetadata.customMetadata.names) {
                try {
                    classNames = JSON.parse(yoloSession.modelMetadata.customMetadata.names.replace(/'/g, '"'));
                } catch(e) {}
            }

            let detections = [];
            const confThresh = 0.35;

            for (let i = 0; i < numAnchors; i++) {
                let maxProb = 0;
                let classId = -1;
                for (let c = 0; c < numClasses; c++) {
                    const prob = out[(4 + c) * numAnchors + i];
                    if (prob > maxProb) {
                        maxProb = prob;
                        classId = c;
                    }
                }
                if (maxProb > confThresh) {
                    const xc = out[0 * numAnchors + i];
                    const yc = out[1 * numAnchors + i];
                    const w = out[2 * numAnchors + i];
                    const h = out[3 * numAnchors + i];

                    // Normalize coordinates to [0,1]
                    const x1 = (xc - w/2) / 640;
                    const y1 = (yc - h/2) / 640;
                    const x2 = (xc + w/2) / 640;
                    const y2 = (yc + h/2) / 640;

                    detections.push({
                        raw_box: [x1, y1, x2, y2],
                        bbox: { x: x1, y: y1, w: x2-x1, h: y2-y1 },
                        category: classNames[classId] || `item_${classId}`,
                        prob: maxProb
                    });
                }
            }

            // 3. Standard NMS
            detections.sort((a, b) => b.prob - a.prob);
            let nmsDets = [];
            const iouThresh = 0.45;
            while (detections.length > 0) {
                const current = detections.shift();
                nmsDets.push(current);
                detections = detections.filter(d => calculateIou(current.raw_box, d.raw_box) < iouThresh);
            }

            // 4. Consolidate nearby boxes of same category
            const finalDetections = consolidateDetections(nmsDets);
            self.postMessage({ type: 'RESULT', id, detections: finalDetections });

        } catch (error) {
            console.error("Worker Object Detection Error:", error);
            self.postMessage({ type: 'ERROR', id, error: error.message });
        }
    }
});