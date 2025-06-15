import numpy as np
from backend.database.db import get_db_connection


def find_sim_products(query_embedding: np.ndarray, top_k: int = 5, filter_brand: str = None, filter_price: list[int] = None) -> list[dict]:
    conn = get_db_connection()
    cur = conn.cursor()
    embedding_list = query_embedding
    query = """ 
        SELECT prod_num, prod_name, brand_name, price, image_url, prod_url, 1 - (image_embedding <=> %s) AS similarity FROM products
        ORDER BY image_embedding <=> %s
        LIMIT %s 
    """
    params = [embedding_list, embedding_list, top_k]
    cur.execute(query, params)
    res = cur.fetchall()
    return [
        {
            "prod_num": row[0],
            "prod_name": row[1],
            "brand_name": row[2],
            "price": row[3],
            "image_url": row[4],
            "prod_url": row[5],
            "similarity": float(row[6])  
        }
        for row in res
    ]
    return([{
            "prod_num": row[0],
            "prod_name": row[1],
            "brand_name": row[2],
            "price": row[3],
            "image_url": row[4],
            "prod_url": row[7],
            "similarity": float(row[8])} for row in res])
