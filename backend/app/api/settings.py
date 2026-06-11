from fastapi import APIRouter
from app.core.config_manager import get_settings, save_settings
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

@router.post("", response_model=SettingsSchema)
def update_settings(payload: SettingsSchema):
    """
    Saves or updates global app configurations in MongoDB, resolving masked values to their original plain-text representation.
    """
    existing = get_settings()
    
    # Resolve SMTP password
    smtp_pw = payload.smtp_password
    if smtp_pw == "********" or not smtp_pw:
        smtp_pw = existing.get("smtp_password", "")
        
    # Resolve IMAP password
    imap_pw = payload.imap_password
    if imap_pw == "********" or not imap_pw:
        imap_pw = existing.get("imap_password", "")
        
    # Resolve Groq API keys
    existing_keys = existing.get("groq_api_keys", [])
    resolved_keys = []
    for inc_key in payload.groq_api_keys:
        # Check if the incoming key is a masked version
        if "..." in inc_key or inc_key == "****":
            # Find matching key in existing keys list
            matched = False
            for ext_key in existing_keys:
                if mask_sensitive_string(ext_key) == inc_key:
                    resolved_keys.append(ext_key)
                    matched = True
                    break
            if not matched:
                # If we couldn't match, we omit or preserve, let's skip to be safe
                pass
        else:
            if inc_key.strip():
                resolved_keys.append(inc_key.strip())
                
    # Update settings dictionary
    updated_data = {
        "groq_api_keys": resolved_keys,
        "smtp_email": payload.smtp_email,
        "smtp_password": smtp_pw,
        "smtp_host": payload.smtp_host,
        "smtp_port": payload.smtp_port,
        "imap_email": payload.imap_email,
        "imap_password": imap_pw,
        "imap_host": payload.imap_host,
        "imap_port": payload.imap_port,
        "send_delay_min": payload.send_delay_min,
        "send_delay_max": payload.send_delay_max
    }
    
    # Save to MongoDB
    save_settings(updated_data)
    
    # Return masked version of saved settings
    masked_settings = dict(updated_data)
    masked_settings["groq_api_keys"] = [mask_sensitive_string(k) for k in resolved_keys]
    masked_settings["smtp_password"] = "********" if smtp_pw else ""
    masked_settings["imap_password"] = "********" if imap_pw else ""
    
    return masked_settings
