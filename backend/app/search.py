import time
import numpy as np
from db import get_db_connection


def find_sim_products(query_embedding: np.ndarray, top_k: int = 20) -> list[dict]:
    start = time.perf_counter()
    conn = get_db_connection()
    cur = conn.cursor()
    query = """
        SELECT prod_num, prod_name, brand_name, price, image_url, prod_url,
               1 - (image_embedding <=> %s) AS similarity
        FROM products
        ORDER BY image_embedding <=> %s
        LIMIT %s
    """
    cur.execute(query, [query_embedding, query_embedding, top_k])
    res = cur.fetchall()
    cur.close()
    conn.close()
    print(f"Search runtime: {(time.perf_counter() - start) * 1000:.1f} ms")
    return [
        {
            "prod_num": row[0],
            "prod_name": row[1],
            "brand_name": row[2],
            "price": row[3],
            "image_url": row[4],
            "prod_url": row[5],
            "similarity": row[6],
        }
        for row in res
    ]