from PIL import Image
import numpy as np
import requests
from config.user_agents import USER_AGENTS
import random
import torch


def normalize_vector(vector: np.ndarray) -> np.ndarray:
    return vector / np.linalg.norm(vector)

def lw_encode_image(image: Image.Image, model, processor) -> np.ndarray:
    inputs = processor(images=image, return_tensors="pt", padding=True)
    with torch.no_grad():
        image_embedding = model.get_image_features(**inputs)
    return normalize_vector(image_embedding.squeeze(0).cpu().numpy())

def lw_encode_image_from_url(image_url: str, model, processor) -> np.ndarray:
    headers = {'User-Agent': random.choice(USER_AGENTS)}
    response = requests.get(image_url, headers=headers, stream=True)
    image = Image.open(response.raw)

    return lw_encode_image(image, model=model, processor=processor)
