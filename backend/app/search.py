import time
import numpy as np
from app.db import get_db_connection

def find_sim_products(query_embedding: np.ndarray, top_k: int = 20, ef_search: int = 64) -> list[dict]:
    start = time.perf_counter()
    conn = get_db_connection()
    cur = conn.cursor()

    # Pass embedding as a string formatted vector '[0.12, -0.04, ...]'
    vec_str = f"[{','.join(map(str, query_embedding.tolist()))}]"
    
    cur.execute(
        "SELECT * FROM find_sim_products(%s::vector, %s, %s);",
        (vec_str, top_k, ef_search)
    )
    res = cur.fetchall()
    cur.close()
    conn.close()

    print(f"Search runtime: {(time.perf_counter() - start) * 1000:.1f} ms")
    return [
        {
            "prod_num": r[0], "prod_name": r[1], "brand_name": r[2],
            "price": r[3], "image_url": r[4], "prod_url": r[5],
            "similarity": r[6], "garment_id": str(r[7]), "category": r[8],
        }
        for r in res
    ]

def find_sim_products_by_id(garment_id: str, top_k: int = 20, ef_search: int = 200) -> list[dict]:
    start = time.perf_counter()
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute(
        "SELECT * FROM find_sim_products_by_id(%s::uuid, %s, %s);",
        (garment_id, top_k, ef_search)
    )
    res = cur.fetchall()
    cur.close()
    conn.close()

    print(f"Search by ID runtime: {(time.perf_counter() - start) * 1000:.1f} ms")
    return [
        {
            "prod_num": r[0], "prod_name": r[1], "brand_name": r[2],
            "price": r[3], "image_url": r[4], "prod_url": r[5],
            "similarity": r[6], "garment_id": str(r[7]), "category": r[8],
        }
        for r in res
    ]