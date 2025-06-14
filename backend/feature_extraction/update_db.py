import json
from encoder import encode_image, encode_text
from backend.database.db import get_db_connection

def verify_encoder():
    with open("data/raw/products.json") as f:
        data = json.load(f)
        for i in range(2):
            url = data["products"][i]["image_url"]
            image_embedding = encode_image(url)
        
def process_to_db():
    with open("data/raw/products.json") as f:
        data = json.load(f)
    conn = get_db_connection()
    cur = conn.cursor()
    for product in data["products"]:
        try:
            image_embedding = encode_image(product["image_url"])
            #text_embedding = encode_text(product["prod_name"])
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
                #,text_embedding
            ))
        except Exception as e:
            print(f"Failed on {product['prod_num']}: {e}")
    conn.commit()
    conn.close()


if __name__ == "__main__":
    process_to_db()
