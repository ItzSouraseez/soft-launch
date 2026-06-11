import smtplib
from app.core.config_manager import get_settings

def get_smtp_config() -> dict:
    """
    Retrieves the SMTP configuration from settings.
    """
    settings = get_settings()
    return {
        "email": settings.get("smtp_email", ""),
        "password": settings.get("smtp_password", ""),
        "host": settings.get("smtp_host", "smtp.gmail.com"),
        "port": int(settings.get("smtp_port", 587))
    }

def connect_smtp(config: dict) -> smtplib.SMTP:
    """
    Establishes an SMTP connection based on the provided configuration.
    Supports standard port 587 (STARTTLS) and port 465 (SSL).
    """
    host = config["host"]
    port = config["port"]
    
    if not config["email"] or not config["password"]:
        raise ValueError("SMTP email and password must be configured.")
        
    if port == 465:
        server = smtplib.SMTP_SSL(host, port, timeout=15)
    else:
        server = smtplib.SMTP(host, port, timeout=15)
        server.ehlo()
        server.starttls()
        server.ehlo()
        
    return server
