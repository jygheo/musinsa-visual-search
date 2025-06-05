import psycopg2
from pgvector.psycopg2 import register_vector
import os


def get_db_connection():
    conn = psycopg2.connect(
        database="fashion_search",
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        host="localhost"
    )
    register_vector(conn)
    return conn
