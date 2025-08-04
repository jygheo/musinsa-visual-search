# musinsa visual search

Search ~10,000 items from fashion-centered e-commerce platform Musinsa via image for faster, more intuitive product discovery.<br>
Due to both the non-uniform naming of products on this site, I created this visual search tool to eliminate the ambiguity of words when searching for clothing.

**Link:** [https://musinsa-visual-search.pages.dev/](https://musinsa-visual-search.pages.dev/)

<img src="https://github.com/jygheo/musinsa-visual-search/blob/main/demo/demo_gif.gif?raw=true" width="600">

## About:

**Tech:** 
Frontend: Vite+React, CSS, deployed w/ Cloudflare pages
Backend: FastAPI (Python), [Fashion CLIP](https://huggingface.co/patrickjohncyh/fashion-clip), PostgreSQL, Redis  
Infra: EC2, RDS, Docker 

**Details:**
User submits an image → Backend computes CLIP embedding → Runs similarity search on pre-indexed product embedding DB → Returns metadata of closest 20 products.



