from bs4 import BeautifulSoup
import requests
import random
import re
import json
from config.user_agents import USER_AGENTS
from backend.database.db import get_db_connection

# TODO: use https://global.musinsa.com/us/category/clothing?page=1&sortCode=NEW (avoid duplicates)

def get_num_pages():
    url = f"https://global.musinsa.com/us/category/clothing?page=1"
    response = requests.get(url, headers={
        'User-Agent': random.choice(USER_AGENTS)})
    soup = BeautifulSoup(response.content, "html.parser")
    script_text = None
    for script in soup.find_all("script"):
        if "const goodsList" in script.text:
            script_text = script.text
            break
    if script_text:
        match = re.search(
            r"const\s+goodsList\s*=\s*(\{.*?\});", script_text, re.DOTALL)
        if match:
            json_str = match.group(1)
            data = json.loads(json_str)
            return (data["totalCount"]/100 + 1)


def get_page_info(page_num=1):
    url = f"https://global.musinsa.com/us/category/clothing?page={page_num}"
    response = requests.get(url, headers={
        'User-Agent': random.choice(USER_AGENTS)})

    soup = BeautifulSoup(response.content, "html.parser")
    script_text = None
    for script in soup.find_all("script"):
        if "const goodsList" in script.text:
            script_text = script.text
            break
    if script_text:
        match = re.search(
            r"const\s+goodsList\s*=\s*(\{.*?\});", script_text, re.DOTALL)
        if match:
            json_str = match.group(1)
            try:
                data = json.loads(json_str)
                goods_info_list = data["goodsInfoList"]
                for goods_dict in goods_info_list:
                    prod_num, prod_name, brand_name, price = goods_dict["goodsNo"], goods_dict["goodsName"], goods_dict["brandName"], goods_dict["price"]
                    image_url = "https:"+goods_dict["imageUrl"]
                    prod_url = f"https://global.musinsa.com/us/goods/{goods_dict['goodsNo']}"

                    conn = get_db_connection()
                    cur = conn.cursor()
                    cur.execute("""
                        INSERT INTO products (
                            prod_num, prod_name, brand_name, price,
                            image_url, prod_url
                        ) VALUES (%s, %s, %s, %s, %s, %s)
                        ON CONFLICT (prod_num) DO UPDATE SET
                            price = EXCLUDED.price
                    """, (prod_num, prod_name, brand_name, price, image_url, prod_url))
                    conn.commit()
                    conn.close()
            except Exception as e:
                print(f"{e} on page {page_num}.")
        else:
            print(f"Could not find goodsList JSON on page {page_num}.")
    else:
        print(f"No relevant <script> tag found on page {page_num}.")

MAX_PAGES = 1

if __name__ == "__main__":
    get_page_info()

