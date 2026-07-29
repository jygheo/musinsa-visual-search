import { env, pipeline, RawImage } from '@xenova/transformers';

// Force transformers.js to use our local models from the public folder
// instead of fetching them from the Hugging Face remote hub.
env.allowLocalModels = true;
env.allowRemoteModels = false; 
env.localModelPath = '/models/';

let clipPipeline = null;
let yoloSession = null; // Will be initialized in Step 4

self.addEventListener('message', async (event) => {
    // Extract the command type, payload data, and unique message ID
    const { type, payload, id } = event.data;

    if (type === 'LOAD_MODELS') {
        try {
            if (!clipPipeline) {
                self.postMessage({ type: 'STATUS', status: 'loading', message: 'Loading FashionCLIP...' });

                // Initialize the feature-extraction pipeline. 
                // 'fashion-clip' corresponds to the public/models/fashion-clip/ directory.
                clipPipeline = await pipeline('feature-extraction', 'fashion-clip', {
                    quantized: true, // Tells it to look for model_quantized.onnx
                    progress_callback: (progressData) => {
                        self.postMessage({ type: 'PROGRESS', progress: progressData });
                    }
                });
            }
            self.postMessage({ type: 'STATUS', status: 'ready', message: 'Models loaded successfully!' });
        } catch (error) {
            console.error("Worker Model Load Error:", error);
            self.postMessage({ type: 'ERROR', error: error.message });
        }
    }

    else if (type === 'EMBED_TEXT') {
        try {
            // Generate embedding, mean pool it, and normalize to match pgvector's cosine distance
            const output = await clipPipeline(payload.text, { pooling: 'mean', normalize: true });
            self.postMessage({ type: 'RESULT', id, embedding: Array.from(output.data) });
        } catch (error) {
            self.postMessage({ type: 'ERROR', id, error: error.message });
        }
    }

    else if (type === 'EMBED_IMAGE') {
        try {
            // Read the image URL or blob URL provided by the main thread
            const image = await RawImage.fromURL(payload.image);
            const output = await clipPipeline(image, { pooling: 'mean', normalize: true });
            self.postMessage({ type: 'RESULT', id, embedding: Array.from(output.data) });
        } catch (error) {
            self.postMessage({ type: 'ERROR', id, error: error.message });
        }
    }
});