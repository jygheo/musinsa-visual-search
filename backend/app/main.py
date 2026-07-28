import io
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from transformers import CLIPProcessor, CLIPModel
import torch
import traceback

from app.search import find_sim_products, find_sim_products_by_id
from app.encoder import encode_image, encode_image_from_url
from app.config import CORS_ORIGINS
from app.detector import get_detections


def get_device():
    if torch.cuda.is_available(): return torch.device("cuda")
    elif torch.backends.mps.is_available(): return torch.device("mps")
    return torch.device("cpu")


device = get_device()

model_id = "patrickjohncyh/fashion-clip"
model = CLIPModel.from_pretrained(model_id)

if device.type == "cpu": 
    with torch.no_grad():
        for p in model.parameters():
            p.data = p.data.clone().contiguous()
        for b in model.buffers():
            b.data = b.data.clone().contiguous()

    model = model.float()
model = model.to(device)
model.eval()
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
        print("\n--- ERROR IN /search-file ---")
        traceback.print_exc()  # This prints the full error to your terminal!
        print("-----------------------------\n")
        raise HTTPException(500, f"Search failed: {str(e)}")

@app.post("/detect")
async def detect_image(file: UploadFile = File(None)):
    if not file:
        raise HTTPException(400, "Provide file.")
    try:
        image = Image.open(io.BytesIO(await file.read())).convert("RGB")
        # Passing the device explicitly to ensure YOLO uses CPU too
        detections = get_detections(image, conf=0.35, device=str(device))
        return {"detections": detections}
    except Exception as e:
        print("\n--- ERROR IN /detect ---")
        traceback.print_exc()
        print("------------------------\n")
        raise HTTPException(500, f"Detection failed: {str(e)}")
    
@app.post("/search-url")
async def search_url(image_url: str = Form(None)):
    if not image_url:
        raise HTTPException(400, "Provide url.")
    try:
        embedding = encode_image_from_url(image_url=image_url, model=model, processor=processor)
        return {"results": find_sim_products(query_embedding=embedding)}
    except Exception as e:
        print("\n--- ERROR IN /search-url ---")
        traceback.print_exc()
        print("----------------------------\n")
        raise HTTPException(500, f"Search failed: {str(e)}")

@app.post("/search-id")
async def search_id(garment_id: str = Form(None)):
    if not garment_id:
        raise HTTPException(400, "Provide garment_id.")
    try:
        return {"results": find_sim_products_by_id(garment_id=garment_id)}
    except Exception as e:
        print("\n--- ERROR IN /search-id ---")
        traceback.print_exc()
        print("----------------------------\n")
        raise HTTPException(500, f"Search failed: {str(e)}")