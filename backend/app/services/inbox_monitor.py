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

import re

def clean_html(html_str: str) -> str:
    """
    Removes HTML tags, style blocks, and script blocks, replacing them with plain text.
    """
    if not html_str:
        return ""
    # Remove script, style, head, title sections
    clean_text = re.sub(r'<(script|style|head|title|meta)[^>]*>([\s\S]*?)<\/\1>', ' ', html_str, flags=re.IGNORECASE)
    # Replace block level tags with newlines
    clean_text = re.sub(r'<(br|p|div|tr|h1|h2|h3|h4|h5|h6|li|ol|ul)[^>]*>', '\n', clean_text, flags=re.IGNORECASE)
    # Strip remaining HTML tags
    clean_text = re.sub(r'<[^>]+>', ' ', clean_text)
    # Unescape HTML entities
    entities = {
        "&nbsp;": " ",
        "&amp;": "&",
        "&lt;": "<",
        "&gt;": ">",
        "&quot;": '"',
        "&apos;": "'",
        "&#39;": "'",
        "&ndash;": "-",
        "&mdash;": "-"
    }
    for ent, char in entities.items():
        clean_text = clean_text.replace(ent, char)
    return clean_text

def extract_email_body(msg) -> str:
    """
    Recursively extracts the readable text body from an email Message object.
    Prefers text/plain. Falls back to text/html with tag cleaning if no plain text is found.
    """
    body = ""
    is_html_fallback = False
    
    if msg.is_multipart():
        # Loop through multipart email to find text/plain
        for part in msg.walk():
            content_type = part.get_content_type()
            content_disposition = str(part.get("Content-Disposition", ""))
            
            if "attachment" in content_disposition:
                continue
                
            if content_type == "text/plain":
                try:
                    charset = part.get_content_charset() or "utf-8"
                    payload = part.get_payload(decode=True)
                    body = payload.decode(charset, errors="replace")
                    is_html_fallback = False
                    break
                except Exception:
                    pass
            elif content_type == "text/html" and not body:
                try:
                    charset = part.get_content_charset() or "utf-8"
                    payload = part.get_payload(decode=True)
                    body = payload.decode(charset, errors="replace")
                    is_html_fallback = True
                except Exception:
                    pass
    else:
        content_type = msg.get_content_type()
        try:
            charset = msg.get_content_charset() or "utf-8"
            payload = msg.get_payload(decode=True)
            body = payload.decode(charset, errors="replace")
            if content_type == "text/html":
                is_html_fallback = True
        except Exception:
            pass

    # Clean HTML if it was html content
    if is_html_fallback or "<html" in body.lower() or "<div" in body.lower():
        body = clean_html(body)
        
    # Standardize whitespace and remove overly long spaces
    body = re.sub(r'[ \t]+', ' ', body)
    body = re.sub(r'\n\s*\n+', '\n\n', body)
    return body.strip()

def classify_incoming_email(api_key: str, subject: str, body: str) -> dict:
    """
    Calls Groq (llama-3.3-70b-versatile) to classify an incoming email reply.
    Categorizes it into: bounce, ooo, reply, or other.
    Extracts sentiment for replies, return dates for OOO, and reasons for bounces.
    """
    from groq import Groq
    import json
    
    if not api_key:
        logger.error("No Groq API key provided for classification.")
        return {"category": "other", "sentiment": "neutral", "bounce_reason": None, "return_date": None}
        
    client = Groq(api_key=api_key)
    
    system_prompt = (
        "You are an expert email analysis assistant. Analyze the incoming email subject and body "
        "and classify it into exactly one of these categories:\n"
        "1. 'bounce': Hard or soft bounces (e.g., mail delivery failed, mailbox full, user not found, blocked by server).\n"
        "2. 'ooo': Out of Office, vacation, or automated replies indicating the sender is temporarily away.\n"
        "3. 'reply': A direct, human-written reply from the recipient (interested, rejection, question, scheduling a meeting, etc.).\n"
        "4. 'other': Spam, newsletters, automatic receipts, or other irrelevant emails.\n\n"
        "If the category is 'ooo', try to parse the date the sender is returning to office. Format it as YYYY-MM-DD. If no return date is found, set it to null.\n"
        "If the category is 'reply', classify the sentiment as:\n"
        "- 'positive': The recruiter is interested, wants to schedule a call, requests a resume/portfolio, or forwards the contact.\n"
        "- 'negative': The recruiter rejects the candidate, states there are no openings, or asks not to be contacted.\n"
        "- 'neutral': The reply is acknowledgement without clear positive/negative intent, or requesting more general info.\n"
        "If the category is 'bounce', identify the reason (e.g., 'invalid_email', 'mailbox_full', 'blocked', 'unknown').\n\n"
        "You MUST respond with a valid JSON object matching this schema:\n"
        "{\n"
        "  \"category\": \"bounce\" | \"ooo\" | \"reply\" | \"other\",\n"
        "  \"sentiment\": \"positive\" | \"negative\" | \"neutral\" | null,\n"
        "  \"bounce_reason\": string | null,\n"
        "  \"return_date\": \"YYYY-MM-DD\" | null\n"
        "}"
    )
    
    user_content = f"Subject: {subject}\n\nBody:\n{body}"
    
    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content}
            ],
            response_format={"type": "json_object"},
            temperature=0.0,  # Deterministic classification
        )
        content = response.choices[0].message.content
        parsed = json.loads(content)
        return {
            "category": parsed.get("category", "other"),
            "sentiment": parsed.get("sentiment"),
            "bounce_reason": parsed.get("bounce_reason"),
            "return_date": parsed.get("return_date")
        }
    except Exception as e:
        logger.error(f"Error classifying email: {e}")
        return {"category": "other", "sentiment": "neutral", "bounce_reason": None, "return_date": None}



