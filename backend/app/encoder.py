import random
import time
import numpy as np
import requests
import torch
from PIL import Image
from app.constants import USER_AGENTS


def normalize_vector(vector: np.ndarray) -> np.ndarray:
    return vector / np.linalg.norm(vector)


def encode_image(image: Image.Image, model, processor) -> np.ndarray:
    image = image.convert("RGB")
    inputs = processor(images=image, return_tensors="pt", padding=True)
    
    inputs = {k: v.to(model.device) for k, v in inputs.items()}
    
    with torch.no_grad():
        image_embedding = model.get_image_features(**inputs)
    return normalize_vector(image_embedding.squeeze(0).cpu().numpy())


def encode_image_from_url(image_url: str, model, processor) -> np.ndarray:
    headers = {"User-Agent": random.choice(USER_AGENTS)}
    response = requests.get(image_url, headers=headers, stream=True, timeout=10)
    response.raise_for_status()
    return encode_image(Image.open(response.raw), model, processor)


def prx_encode_image_from_url(image_url: str, model, processor, proxy_manager, id, retries: int = 3, timeout: int = 10) -> np.ndarray | None:
    for attempt in range(retries):
        proxy = proxy_manager.get()
        proxies = {proxy_manager.protocol: proxy}
        headers = {"User-Agent": random.choice(USER_AGENTS)}
        try:
            response = requests.get(image_url, headers=headers, proxies=proxies, stream=True, timeout=timeout)
            if response.status_code in (403, 404):
                print(f"Blocked: {image_url} status: {response.status_code}")
                break
            response.raise_for_status()
            return encode_image(Image.open(response.raw), model, processor)
        except (requests.RequestException, OSError) as e:
            print(f"[{attempt + 1}/{retries}] failed {image_url} with proxy {proxy.as_string()}: {e}")
            time.sleep(min(10, 2 ** attempt + random.uniform(0, 1)))
    print(f"[FAILURE] All attempts failed for: {id}")
    return None

def encode_text(text: str, model, processor) -> np.ndarray:
    inputs = processor(text=text, return_tensors="pt", padding=True)
    
    # Move all input tensors to the model's device
    inputs = {k: v.to(model.device) for k, v in inputs.items()}
    
    with torch.no_grad():
        text_embedding = model.get_text_features(**inputs)
    return normalize_vector(text_embedding.squeeze(0).cpu().numpy())

def hybrid_embedding(image_url: str, text: str, model, processor, alpha=0.5) -> np.ndarray:
    img_vec = encode_image_from_url(image_url, model, processor)
    txt_vec = encode_text(text, model, processor)
    return alpha * img_vec + (1 - alpha) * txt_vec