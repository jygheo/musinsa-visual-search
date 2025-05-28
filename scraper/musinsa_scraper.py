from bs4 import BeautifulSoup
import requests
import random
import re
import json


user_agents = ['Mozilla/5.0 (compatible; FacebookBot/1.0; +https://developers.facebook.com/docs/sharing/webmasters/facebookbot/)',
               'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
               'Yeti/1.0 (NHN Corp.; http://help.naver.com/robots/)',
               'Yeti/1.0 (+http://help.naver.com/robots/)',
               'Mozilla/5.0 (compatible; MSIE or Firefox mutant; not on Windows server;) Daumoa-image/1.0',
               'Mozilla/5.0 (compatible; MSIE or Firefox mutant; not on Windows server;) Daumoa 4.0',
               'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)']

musinsa_url = "https://global.musinsa.com/us/goods/4234208"

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
            return(data["totalCount"]/100 +1)

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
                prod_dict_list =[]
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

MAX_PAGES = 10
def main():
    all_pages_data = []
    for i in range(1, MAX_PAGES+1):
        all_pages_data.extend(get_page_info(i))
        
    print(all_pages_data)


if __name__ == "__main__":
    main()
