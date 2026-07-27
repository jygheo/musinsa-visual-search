CREATE EXTENSION IF NOT EXISTS vector;

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
    bbox JSONB,             -- {x, y, w, h} normalized 0-1
    polygon JSONB,          -- Normalized points for CSS clip-path mask
    category TEXT,          -- Detected YOLO category 
    is_primary BOOLEAN DEFAULT false,
    embedding vector(512),  
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ON product_garments
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

CREATE TABLE IF NOT EXISTS failed_products (
    id INTEGER PRIMARY KEY,
    image_url TEXT NOT NULL,
    category_code TEXT,
    error TEXT,
    last_attempt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wardrobe_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT, 
    product_garment_id UUID REFERENCES product_garments(id) ON DELETE CASCADE,
    canvas_x REAL DEFAULT 0, 
    canvas_y REAL DEFAULT 0, 
    canvas_rotation REAL DEFAULT 0, 
    canvas_scale REAL DEFAULT 1.0,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);