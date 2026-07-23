import queue
import random
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import requests
import torch
from PIL import Image
from psycopg2 import sql
from psycopg2.extras import DictCursor
from swiftshadow.classes import ProxyInterface
from transformers import CLIPModel, CLIPProcessor

from app.db import get_db_connection
from app.constants import USER_AGENTS

def get_device():
    if torch.cuda.is_available():
        return torch.device("cuda")
    elif torch.backends.mps.is_available():
        return torch.device("mps")
    else:
        return torch.device("cpu")

model_id = "patrickjohncyh/fashion-clip"

def calculate_optimal_lists(num_records: int) -> int:
    if num_records < 1000:
        return max(1, int(num_records / 50))
    return min(1000, int(num_records ** 0.5))

def recreate_ivfflat_index(conn):
    with conn.cursor() as cur:
        try:
            cur.execute("DROP INDEX IF EXISTS products_image_embedding_idx")
            cur.execute("ANALYZE products")
            cur.execute("SELECT reltuples FROM pg_class WHERE relname = 'products'")
            actual_count = int(cur.fetchone()[0])
            optimal_lists = calculate_optimal_lists(actual_count)
            cur.execute(
                sql.SQL(
                    """
                    CREATE INDEX products_image_embedding_idx
                    ON products USING ivfflat (image_embedding vector_cosine_ops)
                    WITH (lists = %s)
                    """
                ),
                [optimal_lists],
            )
            conn.commit()
            print("Index successfully recreated.")
        except Exception as e:
            conn.rollback()
            raise Exception(f"Index creation failed: {e}")

def get_products_batch(batch_size=500, table="products", query_condition="image_embedding IS NULL"):
    conn = get_db_connection()
    cur = conn.cursor(name="products_cursor", cursor_factory=DictCursor)
    cur.execute(
        f"""
        SELECT id, image_url
        FROM {table}
        WHERE {query_condition}
        ORDER BY id
        """
    )
    while True:
        batch = cur.fetchmany(batch_size)
        if not batch:
            break
        yield batch
    cur.close()
    conn.close()

def log_failure(conn, product, error_msg):
    with conn.cursor() as cur:
        try:
            cur.execute(
                """
                INSERT INTO failed_products (id, image_url, error)
                VALUES (%s, %s, %s)
                ON CONFLICT (id) DO UPDATE
                SET error = EXCLUDED.error, last_attempt = NOW()
                """,
                (product["id"], product["image_url"], str(error_msg)),
            )
            conn.commit()
        except Exception as e:
            print(f"Failed to log failure for id {product['id']}: {e}")

# producer

def fetch_and_preprocess(product, processor, proxy_manager, retries=3, timeout=10):
    """Downloads image and converts it to a tensor via processor. Runs in thread pool."""
    image_url = product["image_url"]
    for attempt in range(retries):
        proxy = proxy_manager.get()
        proxies = {proxy_manager.protocol: proxy} if proxy else None
        headers = {"User-Agent": random.choice(USER_AGENTS)}
        
        try:
            response = requests.get(image_url, headers=headers, proxies=proxies, stream=True, timeout=timeout)
            if response.status_code in (403, 404):
                return None, f"Blocked: status {response.status_code}"
            response.raise_for_status()
            
            image = Image.open(response.raw).convert("RGB")
            inputs = processor(images=image, return_tensors="pt", padding=True)
            # Squeeze to remove batch dim, resulting in shape (C, H, W)
            return inputs.pixel_values.squeeze(0), None
        except (requests.RequestException, OSError) as e:
            time.sleep(min(10, 2 ** attempt + random.uniform(0, 1)))
            
    return None, "All retry attempts failed"


# consumer 

def run_consumer_loop(model, device, result_queue, conn, inference_batch_size=64):
    """Main thread loop: Pulls tensors, batches them, runs inference, saves to DB."""
    accumulated_tensors = []
    accumulated_products = []

    def process_accumulated_batch():
        if not accumulated_tensors:
            return
            
        # Move the entire batch of tensors to the right device simultaneously
        batch_tensor = torch.stack(accumulated_tensors).to(device)
        
        with torch.no_grad():
            image_features = model.get_image_features(pixel_values=batch_tensor)
            
        # Normalize vectors 
        image_features = image_features / image_features.norm(p=2, dim=-1, keepdim=True)
        embeddings = image_features.cpu().numpy()

        with conn.cursor() as cur:
            for i, emb in enumerate(embeddings):
                product = accumulated_products[i]
                try:
                    cur.execute(
                        "UPDATE products SET image_embedding = %s WHERE id = %s",
                        (emb.tolist(), product["id"]),
                    )
                    # If it was a retry from failed_products, clear it out
                    cur.execute("DELETE FROM failed_products WHERE id = %s", (product["id"],))
                except Exception as e:
                    print(f"DB update failed for id {product['id']}: {e}")
                    conn.rollback()
                    continue
            conn.commit()

        accumulated_tensors.clear()
        accumulated_products.clear()

    while True:
        item = result_queue.get()
        if item is None:  # Sentinel value indicating producers are done
            break
            
        product, tensor, error = item
        
        if tensor is not None:
            accumulated_tensors.append(tensor)
            accumulated_products.append(product)
        else:
            print(f"Failed preprocessing for id {product['id']}: {error}")
            log_failure(conn, product, error)

        # Run model when batch size is reached
        if len(accumulated_tensors) >= inference_batch_size:
            process_accumulated_batch()

    # Flush any remaining tensors in the final partial batch
    process_accumulated_batch()


def update_embeddings_pipeline(model, processor, proxy_manager, device, 
                               table="products", query_condition="image_embedding IS NULL",
                               inference_batch_size=64, max_workers=10):
    
    conn = get_db_connection()
    result_queue = queue.Queue(maxsize=max_workers * 4) # Limit queue size 

    def producer_worker(product):
        tensor, error = fetch_and_preprocess(product, processor, proxy_manager)
        result_queue.put((product, tensor, error))

    def submit_tasks():
        """Background thread that populates the ThreadPoolExecutor."""
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            for batch in get_products_batch(batch_size=500, table=table, query_condition=query_condition):
                for product in batch:
                    executor.submit(producer_worker, product)
        
        # Send sentinel to tell the consumer loop to break
        result_queue.put(None)

    # Start dispatching tasks in a background thread
    submit_thread = threading.Thread(target=submit_tasks)
    submit_thread.start()

    # Run the consumer loop on the Main thread
    run_consumer_loop(model, device, result_queue, conn, inference_batch_size)

    submit_thread.join()
    conn.close()


def update_all_embeddings_par(model, processor, proxy_manager, device, inference_batch_size=64, max_workers=10):
    print("Starting full embedding update pipeline...")
    update_embeddings_pipeline(model, processor, proxy_manager, device, 
                               table="products", 
                               query_condition="image_embedding IS NULL",
                               inference_batch_size=inference_batch_size, 
                               max_workers=max_workers)
                               
    conn = get_db_connection()
    recreate_ivfflat_index(conn)
    conn.close()


def process_failed_embeddings(model, processor, proxy_manager, device, inference_batch_size=64, max_workers=10):
    print("Retrying failed embeddings...")
    update_embeddings_pipeline(model, processor, proxy_manager, device, 
                               table="failed_products", 
                               query_condition="1=1", # Process all rows in failed_products
                               inference_batch_size=inference_batch_size, 
                               max_workers=max_workers)


if __name__ == "__main__":
    device = get_device()
    print(f"Using device: {device}")
    
    # Load model onto the selected device directly
    model = CLIPModel.from_pretrained(model_id).to(device)
    model.eval()
    processor = CLIPProcessor.from_pretrained(model_id)
    proxy_manager = ProxyInterface(countries=["US"], protocol="http", autoRotate=True)

    # Configuration 
    INFERENCE_BATCH_SIZE = 64
    MAX_PRODUCER_THREADS = 15

    update_all_embeddings_par(
        model=model, 
        processor=processor, 
        proxy_manager=proxy_manager, 
        device=device,
        inference_batch_size=INFERENCE_BATCH_SIZE,
        max_workers=MAX_PRODUCER_THREADS
    )
    
    process_failed_embeddings(
        model=model, 
        processor=processor, 
        proxy_manager=proxy_manager, 
        device=device,
        inference_batch_size=INFERENCE_BATCH_SIZE,
        max_workers=MAX_PRODUCER_THREADS
    )