from bs4 import BeautifulSoup
import requests
import random
import re
import json
from user_agents import user_agents
from datetime import datetime, timezone

def get_num_pages():
    url = f"https://global.musinsa.com/us/category/clothing?page=1"
    response = requests.get(url, headers={
        'User-Agent': random.choice(user_agents)})
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
        'User-Agent': random.choice(user_agents)})

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
                prod_dict_list = []
                for goods_dict in goods_info_list:
                    prod_dict = {
                        "prod_num": goods_dict["goodsNo"],
                        "prod_name": goods_dict["goodsName"],
                        "brand_name": goods_dict["brandName"],
                        "image_URL": "https:"+goods_dict["imageUrl"],
                        "price": goods_dict["price"],
                        "prod_URL": f"https://global.musinsa.com/us/goods/{goods_dict["goodsNo"]}"
                    }
                    prod_dict_list.append(prod_dict)
                return prod_dict_list
            except json.JSONDecodeError as e:
                print(f"Failed to decode JSON: {e} on page {page_num}.")
        else:
            print(f"Could not find goodsList JSON on page {page_num}.")
    else:
        print(f"No relevant <script> tag found on page {page_num}.")


'''
for prod in prod_list_100:
    prod_num = prod["prod_num"]
    image_url = prod["image_URL"]
    try:
        response = requests.get(image_url, headers={
            'User-Agent': random.choice(user_agents)})
        response.raise_for_status()
        with open(f"data/images/{prod_num}.jpg", "wb") as f:
            f.write(response.content)
        prod["image_local_path"] = f"data/images/{prod_num}.jpg"

    except Exception as e:
        print(f"Failed to download {image_url}: {e}")
        prod["image_local_path"] = None

with open("data/raw/products.json", "w") as f:
    json.dump(prod_list_100, f, indent=2)
'''

MAX_PAGES = 1
def main():
    products = []
    for i in range(1, MAX_PAGES+1):
        products.extend(get_page_info(i))
    timestamp = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
    with open("data/raw/products.json", "w") as f:
        json.dump({"products": products,"last_updated": timestamp}, f)


if __name__ == "__main__":
    main()

