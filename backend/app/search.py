import time
import numpy as np
from app.db import get_db_connection


def find_sim_products(query_embedding: np.ndarray, top_k: int = 20, ef_search:int = 200) -> list[dict]:
    start = time.perf_counter()
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SET hnsw.ef_search = %s", (ef_search,))
    query = """
        SELECT p.prod_num, p.name, p.brand, p.price, p.image_url, p.url,
               (SELECT 1 - (pg.image_embedding <=> %s) AS similarity FROM product_garments pg WHERE p.id=pg.id). 
        FROM products p
        ORDER BY image_embedding <=> %s
        LIMIT %s
    """  #TODO fix 
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