from transformers import CLIPProcessor, CLIPModel
import torch
from PIL import Image
import numpy as np
import requests
from config.user_agents import USER_AGENTS
import random
from pathlib import Path
from swiftshadow.classes import Proxy
import time


model_id = "patrickjohncyh/fashion-clip"
model = CLIPModel.from_pretrained(model_id)
processor = CLIPProcessor.from_pretrained(model_id)


def normalize_vector(vector: np.ndarray) -> np.ndarray:
    return vector / np.linalg.norm(vector)


local_image_path = Path(__file__).parent / "test.webp"


def test_local_image(local_image_path):
    image = Image.open(local_image_path).convert("RGB")
    inputs = processor(images=image, return_tensors="pt", padding=True)
    with torch.no_grad():
        image_embedding = model.get_image_features(**inputs)
    if torch.isnan(image_embedding).any():
        raise ValueError("NaN in embeddings")
    return normalize_vector(image_embedding.squeeze(0).cpu().numpy())


def test_url():
    image_url = "https://image.msscdn.net/thumbnails/images/goods_img/20230912/3551101/3551101_16970790961650_big.jpg"
    headers = {'User-Agent': random.choice(USER_AGENTS)}
    response = requests.get(image_url, headers=headers, stream=True)
    image = Image.open(response.raw).convert("RGB")

    inputs = processor(images=image, return_tensors="pt", padding=True)
    with torch.no_grad():
        image_embedding = model.get_image_features(**inputs)
    if torch.isnan(image_embedding).any():
        raise ValueError("NaN in embeddings")
    return normalize_vector(image_embedding.squeeze(0).cpu().numpy())


def encode_image(image: Image.Image) -> np.ndarray:
    inputs = processor(images=image, return_tensors="pt", padding=True)
    with torch.no_grad():
        image_embedding = model.get_image_features(**inputs)
    return normalize_vector(image_embedding.squeeze(0).cpu().numpy())


def encode_image_from_url(image_url: str) -> np.ndarray:
    headers = {'User-Agent': random.choice(USER_AGENTS)}
    response = requests.get(image_url, headers=headers, stream=True)
    image = Image.open(response.raw)

    return encode_image(image)

# protocol="https", countries=["US"],
def prx_encode_image_from_url(image_url: str, proxy_manager, id, retries: int = 3, timeout: int = 10) -> np.ndarray | None:
    for attempt in range(retries):
        proxy = proxy_manager.proxy()
        proxies = {proxy_manager.protocol: proxy}
        headers = {'User-Agent': random.choice(USER_AGENTS)}
        try: 
            response = requests.get(image_url, headers=headers, proxies=proxies ,stream=True, timeout=timeout)
            if response.status_code in [403, 404]:
                print(f"Blocked: {image_url} status: {response.status_code}")
                break 
            response.raise_for_status()
            image = Image.open(response.raw)
            return encode_image(image)
        except (requests.RequestException, OSError) as e:
            print(f"[{attempt+1}/{retries}] failed {image_url} with proxy {proxy.as_string()}: {e}")
            sleep_time = min(10, 2 ** attempt + random.uniform(0, 1)) 
            time.sleep(sleep_time)
    print(f"[FAILURE] All attempts failed for: {id}")
    return None


def encode_text(text: str) -> np.ndarray:
    inputs = processor(text=text, return_tensors='pt', padding=True)
    with torch.no_grad():
        text_embedding = model.get_text_features(**inputs)
    return normalize_vector(text_embedding.squeeze(0).cpu().numpy())


def hybrid_embedding(image_url: str, text: str, alpha=0.5) -> np.ndarray:
    img_vec = encode_image_from_url(image_url)
    txt_vec = encode_text(text)
    return (alpha*img_vec + (1-alpha)*txt_vec)


# if __name__ == "__main__":
#     proxy_manager = Proxy(autoRotate=True, maxProxies=1) 
#     url = "https://image.msscdn.net/thumbnails/images/goods_img/20210825/2087767/2087767_2_big.jpg?w=780"
#     embedding = prx_encode_image_from_url(url, proxy_manager)
#     print(embedding)
