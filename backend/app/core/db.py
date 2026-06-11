import os
from pymongo import MongoClient

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
DATABASE_NAME = os.getenv("DATABASE_NAME", "outreach_db")

# Initialize the PyMongo Client
client = MongoClient(MONGODB_URI)
db = client[DATABASE_NAME]

def get_db():
    """
    Returns the database instance for dependency injection or direct usage.
    """
    return db

def close_db_connection():
    """
    Closes the MongoDB client connection.
    """
    client.close()
