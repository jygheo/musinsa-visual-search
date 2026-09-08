-- DROP TABLE IF EXISTS failed_products CASCADE;
-- DROP TABLE IF EXISTS product_garments CASCADE;
-- DROP TABLE IF EXISTS products CASCADE;

CREATE EXTENSION IF NOT EXISTS vector;

-- Products table
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    brand TEXT,
    price INTEGER,
    image_url TEXT UNIQUE NOT NULL, 
    prod_num TEXT UNIQUE NOT NULL,
    url TEXT UNIQUE NOT NULL,
    category_code TEXT,           
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_garments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    category TEXT,          -- Detected category 
    embedding vector(512),  
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS product_garments_embedding_idx 
    ON product_garments
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

CREATE TABLE IF NOT EXISTS failed_products (
    id INTEGER PRIMARY KEY,
    image_url TEXT NOT NULL,
    category_code TEXT,
    error TEXT,
    last_attempt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);