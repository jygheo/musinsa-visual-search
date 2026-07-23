import requests
import random

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
]

def hunt_for_data():
    url = "https://global.musinsa.com/us/category/001?category1DepthCode=001&gender=A&page=1&sortCode=NEW"
    response = requests.get(url, headers={"User-Agent": random.choice(USER_AGENTS)})
    
    # 1. Save the raw HTML to a file so you can inspect it in your code editor
    with open("musinsa_diagnostic.html", "w", encoding="utf-8") as f:
        f.write(response.text)
        
    print("Raw HTML saved to musinsa_diagnostic.html")

    # 2. Check if a known product ID exists anywhere in the raw text
    test_id = "4334595"
    if test_id in response.text:
        print(f"\nSUCCESS! Found product ID {test_id} in the raw response.")
        print("This means the data is embedded in a script tag. Open musinsa_diagnostic.html, Ctrl+F for the ID, and look at the surrounding structure to see how to extract it.")
    else:
        print(f"\nFAILED. Product ID {test_id} is nowhere in the initial HTML.")
        print("If it's truly not in the HTML and not in the XHR network tabs, Playwright (Option 1 from the previous message) is your best bet to scrape the rendered DOM.")

if __name__ == "__main__":
    hunt_for_data()