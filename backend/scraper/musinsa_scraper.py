import time
import random
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

from app.db import get_db_connection
from app.constants import USER_AGENTS

CATEGORIES = {
    "001": "Tops",
    "002": "Outerwear",
    "003": "Pants",
    "100": "Dresses & Skirts",
}

def run_scraper(target_pages=2):
    conn = get_db_connection()
    cur = conn.cursor()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent=random.choice(USER_AGENTS)
        )

        for cat_code, cat_name in CATEGORIES.items():
            print(f"\n--- Starting Category: {cat_name} ({cat_code}) ---")
            page = context.new_page()

            def handle_response(response):
                if "api2/dp/v3/plp/goods" in response.url and response.status == 200:
                    
                    # Extract page number from URL 
                    parsed_url = urlparse(response.url)
                    page_num = parse_qs(parsed_url.query).get('page', ['1'])[0]
                    
                    try:
                        payload = response.json()
                        items = payload.get("data", {}).get("list", [])
                        if not items:
                            return

                        inserted_count = 0
                        for goods in items:
                            prod_num = goods.get("goodsNo")
                            prod_name = goods.get("name")
                            brand_name = (goods.get("brand") or {}).get("name")
                            price_obj = goods.get("price") or {}
                            price = price_obj.get("finalPrice") if price_obj.get("finalPrice") is not None else price_obj.get("price")
                            
                            raw_img = goods.get("thumbnail") or ""
                            image_url = f"https:{raw_img}" if raw_img.startswith("//") else raw_img
                            prod_url = goods.get("linkUrl") or f"https://global.musinsa.com/us/goods/{prod_num}"

                            cur.execute(
                                """
                                INSERT INTO products (name, brand, price, image_url, prod_num, url, category_code)
                                VALUES (%s, %s, %s, %s, %s, %s, %s)
                                ON CONFLICT (prod_num) DO NOTHING
                                """,
                                (prod_name, brand_name, price, image_url, prod_num, prod_url, cat_code),
                            )
                            inserted_count += 1

                        conn.commit()
                        print(f"Intercepted and processed {inserted_count} products (Page {page_num}).")
                    except Exception as e:
                        print(f"Error parsing intercepted response: {e}")
                        conn.rollback()

            # Attach the interceptor to the page
            page.on("response", handle_response)
            
            print(f"Loading main URL for {cat_name}...")
            page.goto(f"https://global.musinsa.com/us/category/{cat_code}")
            
            # Wait for the initial page load to settle
            page.wait_for_timeout(3000) 
            
            for i in range(target_pages - 1):
                # Scroll to the very bottom of the page
                page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                page.wait_for_timeout(4000) 
                
            page.close()

        browser.close()
    
    cur.close()
    conn.close()
    print("\nScraping complete.")


if __name__ == "__main__":
    run_scraper()