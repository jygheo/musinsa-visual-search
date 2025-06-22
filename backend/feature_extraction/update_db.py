import json
from encoder import encode_image, encode_text
from backend.database.db import get_db_connection
from concurrent.futures import ThreadPoolExecutor
from psycopg2 import sql
from psycopg2.extras import DictCursor, execute_batch
import time


def verify_encoder():
    with open("data/raw/products.json") as f:
        data = json.load(f)
        for i in range(2):
            url = data["products"][i]["image_url"]
            image_embedding = encode_image(url)

def calculate_optimal_lists(num_records: int) -> int:
    if num_records < 1000:
        return max(1, int(num_records / 50))  
    else:
        return min(1000, int(num_records ** 0.5)) 
    
def recreate_ivfflat_index(conn):
    with conn.cursor() as cur:
        try:
            cur.execute("DROP INDEX IF EXISTS products_image_embedding_idx")
            cur.execute("ANALYZE products")
            cur.execute("SELECT reltuples FROM pg_class WHERE relname = 'products'")
            actual_count = int(cur.fetchone()[0])
            optimal_lists = calculate_optimal_lists(actual_count)
            cur.execute(sql.SQL("""
                CREATE INDEX products_image_embedding_idx
                ON products USING ivfflat (image_embedding vector_cosine_ops)
                WITH (lists = %s)
            """), [optimal_lists])            
        except Exception as e:
            conn.rollback()
            raise Exception(f"Index creation failed: {e}")


def get_products_batch(batch_size=1000, last_id=None):
    conn = get_db_connection()
    cur = conn.cursor(name="products_cursor", cursor_factory=DictCursor)
    if last_id:
        query = """
            SELECT id, image_url, prod_name
            FROM products
            WHERE image_embedding IS NULL AND id > %s
            ORDER BY id
            LIMIT %s
        """
        params = (last_id, batch_size)
    else:
        query = """
            SELECT id, image_url, prod_name
            FROM products
            WHERE image_embedding IS NULL
            ORDER BY id
            LIMIT %s
        """
        params = (batch_size,)
    cur.execute(query, params)
    while True:
        batch = cur.fetchmany(batch_size)
        if not batch:
            break
        yield batch

    cur.close()
    conn.close()


def process_product(product):
    return (encode_image(product["image_url"]), product["id"])


def update_embeddings_batch(products_batch):
    with ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(process_product, products_batch))
    update_query = """
        UPDATE products
        SET 
            image_embedding = %s,
            last_updated = NOW()
        WHERE id = %s
    """
    conn = get_db_connection()
    with conn.cursor() as cur:
        execute_batch(cur, update_query, results, page_size=100)
    conn.commit()
    conn.close()

def update_all_embeddings():
    start = time.perf_counter()
    total_processed = 0
    for batch in get_products_batch(batch_size=1000):
        try:
            update_embeddings_batch(batch)
            total_processed += len(batch)
            print(f"Processed {total_processed} items")
            
            with open("progress.json", "w") as f:
                json.dump({"last_id": batch[-1]['id']}, f)
                
        except Exception as e:
            print(f"Failed on batch: {e}")
    conn = get_db_connection()
    recreate_ivfflat_index(conn)
    conn.close()
    end = time.perf_counter()
    print(f'Parallelized runtime: {(end-start)*1000} ms')

def update_all_embeddings_naive():
    start = time.perf_counter()
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=DictCursor)
    cur.execute("""
        SELECT prod_num, prod_name, image_url
        FROM products
        WHERE image_embedding IS NULL
    """)
    products = cur.fetchall()

    for product in products:
        try:
            image_embedding = encode_image(product["image_url"])

            cur.execute("""
                UPDATE products
                SET image_embedding = %s
                WHERE prod_num = %s
            """, (
                image_embedding,
                product["prod_num"]
            ))
        except Exception as e:
            print(f"Failed on {product['prod_num']}: {e}")

    recreate_ivfflat_index(conn)
    conn.commit()
    conn.close()
    end = time.perf_counter()
    print(f'Naive runtime: {(end-start)*1000} ms')



if __name__ == "__main__":
    update_all_embeddings()
    update_all_embeddings_naive()

