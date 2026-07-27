import json
import math
import random
import re
import time

import requests
from bs4 import BeautifulSoup

from app.constants import USER_AGENTS
from app.db import get_db_connection

CATEGORIES = {
    "001": "Tops",
    "002": "Outerwear",
    "003": "Pants",
    "100": "Dresses & Skirts"
}

def _fetch_goods_list(category_code: str, page_num: int) -> dict | None:
    """
    Fetches the raw HTML and extracts the embedded JSON payload containing products.
    """
    url = f"https://global.musinsa.com/us/category/{category_code}?category1DepthCode={category_code}&gender=A&page={page_num}&sortCode=NEW"
    response = requests.get(url, headers={"User-Agent": random.choice(USER_AGENTS)})
    soup = BeautifulSoup(response.content, "html.parser")
    
    for script in soup.find_all("script"):
        if script.text and "const goodsList" in script.text:
            
            marker = "JSON.parse(goodsListJsonString) :"
            if marker in script.text:
                raw_text_starting_with_json = script.text.split(marker)[1].strip()
                
                try:
                    decoder = json.JSONDecoder()
                    data, _ = decoder.raw_decode(raw_text_starting_with_json)
                    return data
                except json.JSONDecodeError as e:
                    print(f"JSON Parsing Error on the new format: {e}")
                    return None
            
            #  Fallback to original (old format)
            match = re.search(r"const\s+goodsList\s*=\s*(\{.*?\});", script.text, re.DOTALL)
            if match:
                try:
                    return json.loads(match.group(1))
                except json.JSONDecodeError as e:
                    print(f"JSON Parsing Error on the old format: {e}")
                    return None
                    
    return None

def get_num_pages(category_code: str) -> int:
    """
    Determines the total number of pages for a specific category.
    """
    data = _fetch_goods_list(category_code, 1)
    if not data:
        raise RuntimeError(f"Could not determine total product count for category {category_code}.")
    
    # 100 items are  per page
    return math.ceil(data["totalCount"] / 100)

def get_page_info(cur, conn, category_code: str, page_num: int = 1):
    """
    Parses the JSON payload and inserts the products into the database.
    """
    data = _fetch_goods_list(category_code, page_num)
    if not data:
        print(f"No goodsList JSON found on category {category_code} page {page_num}.")
        return
        
    try:
        for goods in data.get("goodsInfoList", []):
            prod_num = goods["goodsNo"]
            prod_name = goods["goodsName"]
            brand_name = goods["brandName"]
            price = goods["price"]
            
            # Safely handle image URLs
            raw_img = goods["imageUrl"]
            image_url = f"https:{raw_img}" if raw_img.startswith("//") else raw_img
            
            prod_url = f"https://global.musinsa.com/us/goods/{prod_num}"
            
            cur.execute(
                """
                INSERT INTO products (name, brand, price, image_url, prod_num, url, category_code)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (prod_num) DO NOTHING
                """,
                (prod_name, brand_name, price, image_url, prod_num, prod_url, category_code),
            )
        conn.commit()
    except Exception as e:
        print(f"Error {e} on category {category_code} page {page_num}.")
        conn.rollback()


if __name__ == "__main__":
    conn = get_db_connection()
    cur = conn.cursor()
    
    for cat_code, cat_name in CATEGORIES.items():
        print(f"\n--- Starting Category: {cat_name} ({cat_code}) ---")
        
        try:
            total_pages = min(get_num_pages(cat_code), 2) # Limit for now
            print(f"Scraping {total_pages} pages for {cat_name}...")
            
            for i in range(1, total_pages + 1):
                print(f"Scraping page {i}...")
                get_page_info(cur, conn, cat_code, i)
                
                # Sleep to avoid getting rate-limited
                time.sleep(random.randint(5, 13))
                
        except RuntimeError as e:
            print(e)
            
    cur.close()
    conn.close()
    print("\nScraping complete.")