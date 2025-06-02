from transformers import AutoProcessor, AutoModelForZeroShotImageClassification
import torch
from PIL import Image
import numpy as np

model = AutoModelForZeroShotImageClassification.from_pretrained(
    "patrickjohncyh/fashion-clip")
processor = AutoProcessor.from_pretrained("patrickjohncyh/fashion-clip")


def encode_image(image_path: str) -> np.ndarray:
    image = Image.open(image_path)
    inputs = processor(images=image, return_tensors='pt')
    with torch.no_grad():
        return model.get_image_features(**inputs).squeeze(0).numpy()

def encode_text(text: str) -> np.ndarray:
    inputs = processor(text=text, return_tensors='pt', padding=True)
    with torch.no_grad():
        return model.get_image_features(**inputs).squeeze(0).numpy()

def hybrid_embedding(image_path: str, text: str, alpha=0.5) -> np.ndarray:
    img_vec = encode_image(image_path)
    txt_vec = encode_text(text)
    return(alpha*img_vec + (1-alpha)*txt_vec)
