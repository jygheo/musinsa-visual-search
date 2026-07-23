import io
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from transformers import CLIPProcessor, CLIPModel

from search import find_sim_products
from encoder import encode_image, encode_image_from_url
from config import CORS_ORIGINS
import torch

def get_device():
    if torch.cuda.is_available():
        return torch.device("cuda")
    elif torch.backends.mps.is_available():
        return torch.device("mps")
    else:
        return torch.device("cpu")


device = get_device()
model_id = "patrickjohncyh/fashion-clip"
model = CLIPModel.from_pretrained(model_id).to(device)
model.eval() # Good practice for inference
processor = CLIPProcessor.from_pretrained(model_id)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/search-file")
async def search_file(file: UploadFile = File(None)):
    if not file:
        raise HTTPException(400, "Provide file.")
    try:
        image = Image.open(io.BytesIO(await file.read()))
        embedding = encode_image(image=image, model=model, processor=processor)
        return {"results": find_sim_products(query_embedding=embedding)}
    except Exception as e:
        raise HTTPException(400, f"Search failed: {str(e)}")


@app.post("/search-url")
async def search_url(image_url: str = Form(None)):
    if not image_url:
        raise HTTPException(400, "Provide url.")
    try:
        embedding = encode_image_from_url(image_url=image_url, model=model, processor=processor)
        return {"results": find_sim_products(query_embedding=embedding)}
    except Exception as e:
        raise HTTPException(400, f"Search failed: {str(e)}")