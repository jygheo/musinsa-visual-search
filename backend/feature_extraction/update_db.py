import json
from encoder import encode_image, encode_text
from backend.database.db import get_db_connection


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


def process_to_db():
    with open("data/raw/products.json") as f:
        data = json.load(f)
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("DROP INDEX IF EXISTS products_image_embedding_idx")
    conn.commit()
    for product in data["products"]:
        try:
            image_embedding = encode_image( product["image_url"])
            # text_embedding = encode_text(product["prod_name"])
            cur.execute("""
                INSERT INTO products (
                    prod_num, prod_name, brand_name, price,
                    image_url, prod_url, image_embedding
                ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (prod_num) DO UPDATE SET
                    image_embedding = EXCLUDED.image_embedding
            """, (
                product["prod_num"],
                product["prod_name"],
                product["brand_name"],
                product["price"],
                product["image_url"],
                product["prod_url"],
                image_embedding
                # ,text_embedding
            ))
        except Exception as e:
            print(f"Failed on {product['prod_num']}: {e}")
    cur.execute("ANALYZE products")
    cur.execute("SELECT reltuples FROM pg_class WHERE relname = 'products'")
    actual_count = int(cur.fetchone()[0])

    optimal_lists = calculate_optimal_lists(actual_count)
    cur.execute(f"""
        CREATE INDEX products_image_embedding_idx
        ON products USING ivfflat (image_embedding vector_cosine_ops)
        WITH (lists = {optimal_lists})
    """)

    conn.commit()
    conn.close()


if __name__ == "__main__":
    process_to_db()
