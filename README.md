# musinsa visual search

Search ~10,000 items from fashion-centered e-commerce platform Musinsa via image for faster, more intuitive product discovery. 
Due to both the sheer volume and non-uniform naming of products on this site, I created this visual search tool to eliminate the ambiguity of words when searching for clothing.

**Link:** [https://musinsa-visual-search.pages.dev/](https://musinsa-visual-search.pages.dev/)

![demo gif](https://github.com/jygheo/musinsa-visual-search/blob/main/demo/demo_gif.gif?raw=true)

## About:

**Tech:** 
Frontend: Vite+React, CSS, deployed w/ Cloudflare pages
Backend: FastAPI (Python), [Fashion CLIP](https://huggingface.co/patrickjohncyh/fashion-clip), PostgreSQL, Redis  
Infra: EC2, RDS, Docker 

User submits an image → Backend computes CLIP embedding → runs similarity search on pre-indexed product embedding db → returns metadata of closest 20 products.


