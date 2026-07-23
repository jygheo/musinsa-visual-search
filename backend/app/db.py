import psycopg2
from pgvector.psycopg2 import register_vector
from config import DB_NAME, DB_USER, DB_PASSWORD, DB_HOST, DB_PORT


def get_db_connection():
    conn = psycopg2.connect(
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
        host=DB_HOST,
        port=DB_PORT,
    )
    register_vector(conn)
    return conn