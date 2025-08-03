from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
import io
from PIL import Image
from search.search import find_sim_products
# from feature_extraction.encoder import encode_image, encode_image_from_url, encode_text
from feature_extraction.lightweight_encoder import lw_encode_image, lw_encode_image_from_url
from transformers import CLIPProcessor, CLIPModel
import redis 


model_id = "patrickjohncyh/fashion-clip"
model = CLIPModel.from_pretrained(model_id)
processor = CLIPProcessor.from_pretrained(model_id)

app = FastAPI()
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://musinsa-visual-search.pages.dev"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

r = redis.Redis(host="redis", port=6379, decode_responses=True)

RATE_LIMIT = 3
WINDOW = 60
def rate_limiter(request: Request):
    ip = request.client.host
    key = f"ratelimit{ip}"
    try:
        reqs = r.incr(key)
        if reqs == 1:
            r.expire(name=key,time=WINDOW)
        elif reqs > RATE_LIMIT:
            raise HTTPException(
                status_code=429,
                detail="rate limit exceeded"
            )
    except redis.RedisError:
        pass


@app.post("/search-file")
async def search(request: Request, file: UploadFile = File(None), _: None = Depends(rate_limiter)):
    if not file:
        raise HTTPException(400, "Provide file.")
    try:

        image = Image.open(io.BytesIO(await file.read()))
        embedding = lw_encode_image(image=image, model=model, processor=processor)
        return {"results": find_sim_products(query_embedding=embedding)}

    except Exception as e:
        raise HTTPException(400, f"Search failed: {str(e)}")


@app.post("/search-url")
async def search(request: Request, image_url: str = Form(None), _: None = Depends(rate_limiter)):
    if not image_url:
        raise HTTPException(400, "Provide url.")
    try:
        embedding = lw_encode_image_from_url(image_url=image_url, model=model, processor=processor)
        return {"results": find_sim_products(query_embedding=embedding)}

    except Exception as e:
        raise HTTPException(400, f"Search failed: {str(e)}")
