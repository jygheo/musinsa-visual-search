from pathlib import Path
from backend.feature_extraction.encoder import test_local_image
from search import find_sim_products

image_path = Path(__file__).parent / "test.png"
query_embedding = test_local_image(image_path)
res = find_sim_products(query_embedding=query_embedding, top_k=3)
print("Top 3 matches:")
for prod in res:
    print(f"Num: {prod['prod_num']}, Name: {prod['prod_name']}, Brand: {prod['brand_name']}, Price: {prod['price']}, Image URL: {prod['image_url']}, Prod URL: {prod['prod_url']}, Sim: {prod['similarity']}")
    
