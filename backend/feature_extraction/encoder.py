from transformers import AutoProcessor, AutoModelForZeroShotImageClassification
import torch
from PIL import Image
import numpy as np
import requests
from user_agents import user_agents
import random

model = AutoModelForZeroShotImageClassification.from_pretrained(
    "patrickjohncyh/fashion-clip")
processor = AutoProcessor.from_pretrained("patrickjohncyh/fashion-clip")


def encode_image(image_url: str) -> np.ndarray:
    image = Image.open(requests.get(image_url, headers={
        'User-Agent': random.choice(user_agents)}, stream=True).raw)
    inputs = processor(images=image, return_tensors='pt')
    with torch.no_grad():
        return model.get_image_features(**inputs).squeeze(0).numpy()

def encode_text(text: str) -> np.ndarray:
    inputs = processor(text=text, return_tensors='pt', padding=True)
    with torch.no_grad():
        return model.get_image_features(**inputs).squeeze(0).numpy()

def hybrid_embedding(image_url: str, text: str, alpha=0.5) -> np.ndarray:
    img_vec = encode_image(image_url)
    txt_vec = encode_text(text)
    return(alpha*img_vec + (1-alpha)*txt_vec)
