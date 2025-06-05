import psycopg2
from pgvector.psycopg2 import register_vector
import os
from dotenv import load_dotenv


def get_db_connection():
    load_dotenv()
    conn = psycopg2.connect(
        database=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        host="localhost"
    )
    register_vector(conn)
    return conn
