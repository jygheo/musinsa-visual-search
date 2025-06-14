from transformers import CLIPProcessor, AutoProcessor, CLIPModel, AutoModelForZeroShotImageClassification
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

def test_local_image():
    image_path = Path(__file__).parent / "test.webp"
    image = Image.open(image_path).convert("RGB")
    inputs = processor(images=image, return_tensors="pt", padding=True)
    with torch.no_grad():
        image_embeds = model.get_image_features(**inputs)
    if torch.isnan(image_embeds).any():
        raise ValueError("NaN in embeddings")
    return image_embeds.squeeze(0).cpu().numpy()

def test_url():
    image_url = "https://image.msscdn.net/thumbnails/images/goods_img/20230912/3551101/3551101_16970790961650_big.jpg"
    headers = {'User-Agent': random.choice(USER_AGENTS)}
    response = requests.get(image_url, headers=headers, stream=True)
    image = Image.open(response.raw)
    
    inputs = processor(images=image, return_tensors="pt", padding=True)
    with torch.no_grad():
        image_embeds = model.get_image_features(**inputs)
    if torch.isnan(image_embeds).any():
        raise ValueError("NaN in embeddings")
    return image_embeds.squeeze(0).cpu().numpy()


def encode_image(image_url: str) -> np.ndarray:
    headers = {'User-Agent': random.choice(USER_AGENTS)}
    response = requests.get(image_url, headers=headers, stream=True)
    image = Image.open(response.raw)

    inputs = processor(images=image, return_tensors="pt", padding=True)
    with torch.no_grad():
        image_embeds = model.get_image_features(**inputs)
    return image_embeds.squeeze(0).cpu().numpy()

def encode_text(text: str) -> np.ndarray:
    inputs = processor(text=text, return_tensors='pt', padding=True)
    with torch.no_grad():
        text_embeds= model.get_image_features(**inputs)
    return text_embeds.squeeze(0).numpy()

def hybrid_embedding(image_url: str, text: str, alpha=0.5) -> np.ndarray:
    img_vec = encode_image(image_url)
    txt_vec = encode_text(text)
    return(alpha*img_vec + (1-alpha)*txt_vec)

