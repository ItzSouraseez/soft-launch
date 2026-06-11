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

import email
from email.header import decode_header
import datetime

def decode_mime_header(header_value: str) -> str:
    """
    Decodes RFC 2047 encoded email headers into standard strings.
    """
    if not header_value:
        return ""
    decoded_parts = decode_header(header_value)
    header_text = []
    for part, encoding in decoded_parts:
        if isinstance(part, bytes):
            try:
                header_text.append(part.decode(encoding or "utf-8", errors="replace"))
            except Exception:
                header_text.append(part.decode("latin1", errors="replace"))
        else:
            header_text.append(part)
    return "".join(header_text).strip()

def search_inbox(mail: imaplib.IMAP4_SSL, days_back: int = 7) -> list:
    """
    Selects INBOX and searches for emails received within the last N days.
    Returns a list of email message IDs (IMAP indices).
    """
    logger.info(f"Selecting INBOX folder...")
    mail.select("INBOX")
    
    # Calculate date boundary
    since_date = (datetime.date.today() - datetime.timedelta(days=days_back)).strftime("%d-%b-%Y")
    search_query = f"SINCE {since_date}"
    
    logger.info(f"Searching inbox with query: {search_query}")
    status, data = mail.search(None, search_query)
    
    if status != "OK":
        logger.error(f"IMAP search failed with status: {status}")
        return []
        
    # Search returns space-separated message indices
    msg_ids = data[0].split()
    logger.info(f"Found {len(msg_ids)} email messages in search range.")
    return msg_ids

def fetch_email_by_id(mail: imaplib.IMAP4_SSL, msg_id: bytes) -> dict:
    """
    Fetches raw email message by IMAP message ID and parses headers.
    Returns a dictionary of headers and raw body.
    """
    status, data = mail.fetch(msg_id, "(RFC822)")
    if status != "OK" or not data or not data[0]:
        logger.warning(f"Could not fetch email ID {msg_id.decode()}")
        return None
        
    raw_email = data[0][1]
    msg = email.message_from_bytes(raw_email)
    
    # Extract headers
    headers = {
        "from": decode_mime_header(msg.get("From")),
        "subject": decode_mime_header(msg.get("Subject")),
        "date": decode_mime_header(msg.get("Date")),
        "message_id": decode_mime_header(msg.get("Message-ID")),
        "in_reply_to": decode_mime_header(msg.get("In-Reply-To")),
        "references": decode_mime_header(msg.get("References")),
        "to": decode_mime_header(msg.get("To"))
    }
    
    return {
        "headers": headers,
        "message_object": msg
    }

