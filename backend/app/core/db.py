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

def init_db():
    """
    Initializes database indexes for the collections:
    - blocked_domains: unique index on 'domain'
    - recipients: index on 'email', 'campaign_id', and compound index on ('campaign_id', 'email')
    """
    # Create unique index on domain field for blocked_domains
    db.blocked_domains.create_index("domain", unique=True)
    
    # Create indexes on recipients collection
    db.recipients.create_index("email")
    db.recipients.create_index("campaign_id")
    db.recipients.create_index([("campaign_id", 1), ("email", 1)])

def close_db_connection():
    """
    Closes the MongoDB client connection.
    """
    client.close()
