from app.core.db import get_db

db = get_db()

# We store application settings in a document with _id = "global_settings"
SETTINGS_ID = "global_settings"

# We store user profile in a document with _id = "user_profile"
PROFILE_ID = "user_profile"

def get_settings() -> dict:
    """
    Retrieves global settings from the 'settings' collection.
    Returns default values if not configured yet.
    """
    settings_doc = db.settings.find_one({"_id": SETTINGS_ID})
    if not settings_doc:
        # Return a default empty/unconfigured structure
        return {
            "_id": SETTINGS_ID,
            "groq_api_keys": [],  # List of keys for round-robin rotation
            "smtp_email": "",
            "smtp_password": "",  # App password
            "smtp_host": "smtp.gmail.com",
            "smtp_port": 587,
            "imap_email": "",
            "imap_password": "",  # App password
            "imap_host": "imap.gmail.com",
            "imap_port": 993,
            "send_delay_min": 30,  # Default minimum delay in seconds
            "send_delay_max": 60,  # Default maximum delay in seconds
        }
    return settings_doc

def save_settings(settings_data: dict) -> dict:
    """
    Saves or updates global settings in the 'settings' collection.
    """
    # Clean the input dictionary to avoid changing the ID
    settings_data = dict(settings_data)
    settings_data["_id"] = SETTINGS_ID
    
    db.settings.replace_one(
        {"_id": SETTINGS_ID},
        settings_data,
        upsert=True
    )
    return settings_data

def get_profile() -> dict:
    """
    Retrieves user profile information from the 'settings' collection.
    Returns default values if not configured yet.
    """
    profile_doc = db.settings.find_one({"_id": PROFILE_ID})
    if not profile_doc:
        return {
            "_id": PROFILE_ID,
            "full_name": "",
            "title": "",
            "bio": "",
            "skills": [],
            "experience": [],  # List of experiences
            "education": [],
            "projects": [],
            "social_links": {
                "linkedin": "",
                "github": "",
                "portfolio": ""
            },
            "resume_parsed": False,
            "resume_path": "",
            "raw_resume_text": ""
        }
    return profile_doc

def save_profile(profile_data: dict) -> dict:
    """
    Saves or updates user profile in the 'settings' collection.
    """
    profile_data = dict(profile_data)
    profile_data["_id"] = PROFILE_ID
    
    db.settings.replace_one(
        {"_id": PROFILE_ID},
        profile_data,
        upsert=True
    )
    return profile_data
