import json
from encoder import prx_encode_image_from_url, encode_image_from_url, encode_text
from database.db import get_db_connection
from concurrent.futures import ThreadPoolExecutor, as_completed
from psycopg2 import sql
from psycopg2.extras import DictCursor, execute_batch
import time
from swiftshadow.classes import Proxy


def verify_encoder():
    with open("data/raw/products.json") as f:
        data = json.load(f)
        for i in range(2):
            url = data["products"][i]["image_url"]
            image_embedding = encode_image_from_url(url)


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
            cur.execute(
                "SELECT reltuples FROM pg_class WHERE relname = 'products'")
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


def get_products_batch(batch_size=500):
    conn = get_db_connection()
    cur = conn.cursor(name="products_cursor", cursor_factory=DictCursor)

    query = """
        SELECT id, image_url
        FROM products
        WHERE image_embedding IS NULL
        ORDER BY id
    """
    cur.execute(query)

    while True:
        batch = cur.fetchmany(batch_size)
        if not batch:
            break
        yield batch

    cur.close()
    conn.close()


def update_all_embeddings_naive():
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=DictCursor)
    cur.execute("""
        SELECT id, image_url
        FROM products
        WHERE image_embedding IS NULL
    """)
    products = cur.fetchall()

    for product in products:
        try:
            image_embedding = prx_encode_image_from_url(product["image_url"], proxy_manager)

            cur.execute("""
                UPDATE products
                SET image_embedding = %s
                WHERE id = %s
            """, (
                image_embedding,
                product["id"]
            ))
        except Exception as e:
            print(f"Failed on id {product['id']}: {e}")

    recreate_ivfflat_index(conn)
    conn.commit()
    conn.close()


def log_failure(conn, product, error_msg):
    with conn.cursor() as cur:
        try:
            cur.execute("""
                INSERT INTO failed_products (id, image_url, error)
                VALUES (%s, %s, %s)
                ON CONFLICT (id) DO UPDATE
                SET error = EXCLUDED.error, last_attempt = NOW()
            """, (product['id'], product['image_url'], error_msg))
            conn.commit()
        except Exception as e:
            print(f"Failed to log failure for id {product['id']}: {e}")

proxy_manager = Proxy(autoRotate=True, maxProxies=25) 
def process_batch(batch, conn, max_workers=10):
    results = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_product = {
            executor.submit(prx_encode_image_from_url, product["image_url"], proxy_manager, product["id"]): product
            for product in batch
        }

        for future in as_completed(future_to_product):
            product = future_to_product[future]
            try:
                embedding = future.result()
                if embedding is not None:
                    results.append((embedding, product["id"]))
                else:
                    print(
                        f"Embedding failed for product id {product['id']}")
                    log_failure(conn, product, "embedding returned None")
            except Exception as e:
                print(
                    f"Unexpected error for product id {product['id']}: {e}")
                log_failure(conn, product, str(e))
    return results


def update_all_embeddings_par(batch_size=500, max_workers=10):
    conn = get_db_connection()
    cur = conn.cursor()

    for batch in get_products_batch(batch_size):
        results = process_batch(batch, conn, max_workers=max_workers)

        for embedding, product_id in results:
            try:
                cur.execute("""
                    UPDATE products
                    SET image_embedding = %s
                    WHERE id = %s
                """, (embedding, product_id))
            except Exception as e:
                print(f"DB update failed for id {product_id}: {e}")
                conn.rollback()
                continue
        conn.commit()
    recreate_ivfflat_index(conn)
    conn.close()



def process_failed_embeddings(max_workers=10):
    conn = get_db_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT id, image_url FROM failed_products")
        failed = [{"id": row[0], "image_url": row[1]}
                  for row in cur.fetchall()]

    print(f"Retrying {len(failed)} failed embeddings")
    results = process_batch(failed, conn, max_workers=max_workers)

    # On success, delete from failed_products
    with conn.cursor() as cur:
        for embedding, product_id in results:
            try:
                cur.execute("""
                    UPDATE products SET image_embedding = %s WHERE id = %s
                """, (embedding, product_id))
                cur.execute(
                    "DELETE FROM failed_products WHERE id = %s", (product_id,))
            except Exception as e:
                print(f"Retry update failed for id {product_id}: {e}")
                conn.rollback()
                continue

    conn.commit()
    conn.close()


if __name__ == "__main__":
    update_all_embeddings_par()
    process_failed_embeddings()
    # update_all_embeddings_naive()
