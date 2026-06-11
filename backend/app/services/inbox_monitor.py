import imaplib
import logging
from app.core.config_manager import get_settings

logger = logging.getLogger("app.services.inbox_monitor")

def get_imap_config() -> dict:
    """
    Retrieves the IMAP configuration from settings.
    """
    settings = get_settings()
    return {
        "email": settings.get("imap_email", ""),
        "password": settings.get("imap_password", ""),
        "host": settings.get("imap_host", "imap.gmail.com"),
        "port": int(settings.get("imap_port", 993))
    }

def connect_imap(config: dict) -> imaplib.IMAP4_SSL:
    """
    Establishes an SSL connection to the IMAP server and logs in.
    """
    email = config.get("email", "")
    password = config.get("password", "")
    host = config.get("host", "imap.gmail.com")
    port = config.get("port", 993)

    if not email or not password:
        raise ValueError("IMAP email and password must be configured.")

    logger.info(f"Connecting to IMAP server {host}:{port} SSL...")
    mail = imaplib.IMAP4_SSL(host, port, timeout=20)
    try:
        mail.login(email, password)
        logger.info("IMAP login successful.")
        return mail
    except Exception as e:
        try:
            mail.logout()
        except Exception:
            pass
        raise e
