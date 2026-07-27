import time
import numpy as np
from app.db import get_db_connection

def find_sim_products(query_embedding: np.ndarray, top_k: int = 20, ef_search: int = 200) -> list[dict]:
    start = time.perf_counter()
    conn = get_db_connection()
    cur = conn.cursor()
    
    cur.execute("SET hnsw.ef_search = %s", (ef_search,))
    
    query = """
        SELECT 
            p.prod_num, 
            p.name, 
            p.brand, 
            p.price, 
            p.image_url, 
            p.url,
            1 - (pg.embedding <=> %s::vector) AS similarity,
            pg.id AS garment_id,
            pg.bbox,
            pg.polygon,
            pg.category,
            pg.is_primary
        FROM product_garments pg
        JOIN products p ON pg.product_id = p.id
        ORDER BY pg.embedding <=> %s::vector
        LIMIT %s
    """
    
    cur.execute(query, [query_embedding.tolist(), query_embedding.tolist(), top_k])
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
            "garment_id": row[7],
            "bbox": row[8],
            "polygon": row[9],
            "category": row[10],
            "is_primary": row[11]
        }
        for row in res
    ]