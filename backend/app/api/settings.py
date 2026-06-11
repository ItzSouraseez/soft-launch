from fastapi import APIRouter
from app.core.config_manager import get_settings
from app.schemas.settings import SettingsSchema

router = APIRouter(prefix="/api/settings", tags=["settings"])

def mask_sensitive_string(val: str) -> str:
    """
    Masks a sensitive string (like API keys) showing only first 4 and last 4 characters.
    """
    if not val:
        return ""
    if len(val) <= 8:
        return "****"
    return f"{val[:4]}...{val[-4:]}"

@router.get("", response_model=SettingsSchema)
def read_settings():
    """
    Retrieves app settings with masked credentials to prevent exposing secret keys to the client.
    """
    settings = get_settings()
    
    # Create a copy to avoid modifying the database cache in-place
    masked_settings = dict(settings)
    
    # Mask Groq API keys
    masked_settings["groq_api_keys"] = [
        mask_sensitive_string(key) for key in settings.get("groq_api_keys", [])
    ]
    
    # Mask SMTP Password
    if settings.get("smtp_password"):
        masked_settings["smtp_password"] = "********"
    else:
        masked_settings["smtp_password"] = ""
        
    # Mask IMAP Password
    if settings.get("imap_password"):
        masked_settings["imap_password"] = "********"
    else:
        masked_settings["imap_password"] = ""
        
    return masked_settings
