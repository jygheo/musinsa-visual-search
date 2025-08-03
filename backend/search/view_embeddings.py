from database.db import get_db_connection

conn = get_db_connection()
cur = conn.cursor()
cur.execute("SELECT image_embedding FROM products WHERE id = %s", (10681,))
vec = cur.fetchone()[0]  
cur.execute("SELECT  COUNT(*) FILTER (WHERE image_embedding IS NOT NULL) FROM products")
res = cur.fetchone()[0]
print(vec[:10])
print(res)