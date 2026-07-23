
CREATE EXTENSION IF NOT EXISTS vector;
 
CREATE TABLE IF NOT EXISTS products (
    id              SERIAL PRIMARY KEY,
    prod_num        TEXT UNIQUE NOT NULL,
    prod_name       TEXT NOT NULL,
    brand_name      TEXT,
    price           INTEGER,
    image_url       TEXT NOT NULL,
    prod_url        TEXT NOT NULL,
    image_embedding VECTOR(512)   -- confirm against model.config.projection_dim before loading data
);
 
CREATE TABLE IF NOT EXISTS failed_products (
    id           INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
    image_url    TEXT NOT NULL,
    error        TEXT,
    last_attempt TIMESTAMPTZ DEFAULT NOW()
);
 
-- Don't create the ivfflat index here. Build it only after the initial
-- embedding backfill via scraper/backfill_embeddings.py's recreate_ivfflat_index(),
-- since `lists` needs to be tuned against the real row count, and an index
-- built on an empty/near-empty table is useless (and gets stale as rows are added).