from transformers import CLIPProcessor, CLIPModel
import torch
from PIL import Image
import numpy as np
import requests
from config.user_agents import USER_AGENTS
import random
from pathlib import Path

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

def encode_image(image_url: str) -> np.ndarray:
    headers = {'User-Agent': random.choice(USER_AGENTS)}
    response = requests.get(image_url, headers=headers, stream=True)
    image = Image.open(response.raw)

    inputs = processor(images=image, return_tensors="pt", padding=True)
    with torch.no_grad():
        image_embedding = model.get_image_features(**inputs)
    return normalize_vector(image_embedding.squeeze(0).cpu().numpy())

def encode_text(text: str) -> np.ndarray:
    inputs = processor(text=text, return_tensors='pt', padding=True)
    with torch.no_grad():
        text_embedding= model.get_text_features(**inputs)
    return normalize_vector(text_embedding.squeeze(0).cpu().numpy())

def hybrid_embedding(image_url: str, text: str, alpha=0.5) -> np.ndarray:
    img_vec = encode_image(image_url)
    txt_vec = encode_text(text)
    return(alpha*img_vec + (1-alpha)*txt_vec)

