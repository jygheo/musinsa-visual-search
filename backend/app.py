from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import io
from PIL import Image
from backend.search.search import find_sim_products
from backend.feature_extraction.encoder import encode_image, encode_image_from_url, encode_text
app = FastAPI()
origins = []

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
@app.post("/search")
async def search(file: UploadFile = File(None), image_url: str = Form(None)):
    if not(file or image_url):
        raise HTTPException(400, "Provide either file or url")
    try:
        if file:
            image = Image.open(io.BytesIO(await file.read()))
            embedding = encode_image(image)

        elif image_url:
            embedding = encode_image_from_url(image_url)
        return({"results": find_sim_products(query_embedding=embedding)})
            
    except Exception as e:
        raise HTTPException(400, f"Search failed: {str(e)}")

            

