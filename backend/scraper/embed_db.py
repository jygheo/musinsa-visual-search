import os
import json
import queue
import random
import threading
import time
from concurrent.futures import ThreadPoolExecutor
import numpy as np
import requests
import torch
from PIL import Image
from psycopg2.extras import DictCursor
from transformers import CLIPModel, CLIPProcessor

from swiftshadow.classes import ProxyInterface
from app.db import get_db_connection
from app.constants import USER_AGENTS


def get_device():
    if torch.cuda.is_available():
        return torch.device("cuda")
    elif torch.backends.mps.is_available():
        return torch.device("mps")
    else:
        return torch.device("cpu")


DEVICE = get_device()
print(f"Using device: {DEVICE}")

CLIP_MODEL_ID = "patrickjohncyh/fashion-clip"
clip_model = CLIPModel.from_pretrained(CLIP_MODEL_ID).to(DEVICE)
clip_model.eval()
clip_processor = CLIPProcessor.from_pretrained(CLIP_MODEL_ID)

# Maps scraper category codes to a human-readable category label.
# (Previously used to match against YOLO class names; now just stored directly.)
SCRAPER_TO_MODEL_MAP = {
    "001": "top",
    "002": "outerwear",
    "003": "pants",
    "100": "dress",
    "004": "bag",
    "103": "footwear",
    "120": "headwear",
    "101": "accessory",
}


def get_products_batch(batch_size=200, table="products", condition="id NOT IN (SELECT product_id FROM product_garments)"):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=DictCursor)
    cur.execute(
        f"SELECT id, image_url, category_code FROM {table} WHERE {condition} ORDER BY id")
    while True:
        batch = cur.fetchmany(batch_size)
        if not batch:
            break
        yield batch
    cur.close()
    conn.close()


def log_failure(conn, product_id, image_url, category_code, error_msg):
    with conn.cursor() as cur:
        try:
            cur.execute("""
                INSERT INTO failed_products (id, image_url, category_code, error)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET error = EXCLUDED.error, last_attempt = CURRENT_TIMESTAMP
            """, (product_id, image_url, category_code, str(error_msg)))
            conn.commit()
        except Exception as e:
            print(f"Failed to log error for id {product_id}: {e}")


def fetch_image(image_url, proxy_manager, retries=3):
    """Producer-side work only: downloading and downscaling heavy images."""
    for attempt in range(retries):
        proxy = proxy_manager.get()
        proxies = {proxy_manager.protocol: proxy} if proxy else None
        headers = {"User-Agent": random.choice(USER_AGENTS)}
        try:
            response = requests.get(
                image_url, headers=headers, proxies=proxies, stream=True, timeout=10)
            if response.status_code in (403, 404):
                return None, f"Blocked: {response.status_code}"
            response.raise_for_status()

            img = Image.open(response.raw).convert("RGB")
            # OPTIMIZATION: Shrink giant images immediately to save CPU downstream
            if max(img.size) > 960:
                img.thumbnail((960, 960), Image.BICUBIC)

            return img, None
        except Exception:
            time.sleep(2 ** attempt + random.uniform(0, 1))
    return None, "All retries failed"


def run_consumer_loop(result_queue, conn, batch_size=16):
    """Main thread: CLIP runs in batches on the full product image."""
    batch_buffer = []

    def flush_batch():
        if not batch_buffer:
            return

        valid_items = batch_buffer.copy()
        batch_buffer.clear()

        images = [img for _, img in valid_items]
        products = [p for p, _ in valid_items]

        # batch clip on full images (no cropping/detection step anymore)
        inputs = clip_processor(
            images=images, return_tensors="pt", padding=True)
        inputs = {k: v.to(DEVICE) for k, v in inputs.items()}
        with torch.no_grad():
            image_features = clip_model.get_image_features(**inputs)
            if not torch.is_tensor(image_features):
                image_features = image_features.pooler_output
            image_features = image_features / \
                image_features.norm(p=2, dim=-1, keepdim=True)
            embeddings = image_features.cpu().numpy()

        # --- BATCHED DB INSERT ---
        with conn.cursor() as cur:
            try:
                for i, product in enumerate(products):
                    category = SCRAPER_TO_MODEL_MAP.get(
                        str(product.get('category_code')), 'unknown')
                    embedding = embeddings[i].tolist()
                    cur.execute("""
                        INSERT INTO product_garments (product_id, category, is_primary, embedding)
                        VALUES (%s, %s, %s, %s)
                    """, (
                        product['id'], category, True, str(embedding)
                    ))
                    cur.execute(
                        "DELETE FROM failed_products WHERE id = %s", (product['id'],))
                conn.commit()
            except Exception as e:
                print(f"DB Insert failed for batch: {e}")
                conn.rollback()

        # --- EXPLICIT MEMORY CLEANUP (Crucial for MPS) ---
        if DEVICE.type == 'cuda':
            torch.cuda.empty_cache()
        elif DEVICE.type == 'mps':
            torch.mps.empty_cache()

    while True:
        item = result_queue.get()
        if item is None:
            flush_batch()
            break

        product, img, error = item
        if error:
            print(f"Failed {product['id']}: {error}")
            log_failure(conn, product['id'], product['image_url'], product.get(
                'category_code'), error)
            continue

        batch_buffer.append((product, img))
        if len(batch_buffer) >= batch_size:
            flush_batch()


def update_embeddings_pipeline(proxy_manager, table="products", condition="1=1", max_workers=6, batch_size=16):
    conn = get_db_connection()
    result_queue = queue.Queue(
        maxsize=(max_workers * batch_size))  # buffer generously

    def worker(product):
        img, error = fetch_image(product['image_url'], proxy_manager)
        result_queue.put((product, img, error))

    def submitter():
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            for batch in get_products_batch(table=table, condition=condition):
                for p in batch:
                    executor.submit(worker, p)
        result_queue.put(None)

    threading.Thread(target=submitter).start()
    run_consumer_loop(result_queue, conn, batch_size=batch_size)
    conn.close()


if __name__ == "__main__":
    proxy_manager = ProxyInterface(
        countries=["US"], protocol="http", autoRotate=True)

    print("Starting Embedding Pipeline")
    update_embeddings_pipeline(
        proxy_manager=proxy_manager,
        table="products",
        condition="id NOT IN (SELECT product_id FROM product_garments)",
        max_workers=6,
        batch_size=64
    )
    print("Retrying Failed Products ")
    update_embeddings_pipeline(
        proxy_manager=proxy_manager,
        table="failed_products",
        condition="1=1",
        max_workers=6,
        batch_size=64
    )