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

def validate_smtp_credentials(config: dict) -> tuple[bool, str]:
    """
    Attempts to connect and login to the SMTP server to validate the App Password credentials.
    Returns (True, "") if successful, or (False, "error message") on failure.
    """
    try:
        server = connect_smtp(config)
        try:
            server.login(config["email"], config["password"])
            return True, "SMTP connection and authentication successful."
        except smtplib.SMTPAuthenticationError:
            return False, "Authentication failed. Please check your SMTP email and App Password."
        except Exception as e:
            return False, f"SMTP login failed: {str(e)}"
        finally:
            try:
                server.quit()
            except Exception:
                pass
    except Exception as e:
        return False, f"Failed to connect to SMTP server: {str(e)}"

from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
import os

from email.utils import make_msgid

def compile_email(
    from_email: str,
    to_email: str,
    subject: str,
    body: str,
    resume_path: str = None,
    in_reply_to: str = None,
    references: str = None
) -> tuple[MIMEMultipart, str]:
    """
    Compiles a MIME email message. Optionally attaches a PDF resume.
    Also injects threading headers (In-Reply-To, References) and generates a Message-ID.
    Returns a tuple: (msg_object, message_id_str).
    """
    msg = MIMEMultipart()
    msg["From"] = from_email
    msg["To"] = to_email
    
    # Generate unique Message-ID
    msg_id = make_msgid()
    msg["Message-ID"] = msg_id
    
    # Handle threading headers
    if in_reply_to:
        msg["In-Reply-To"] = in_reply_to
        if references:
            # Append new parent reference to the chain
            msg["References"] = f"{references} {in_reply_to}".strip()
        else:
            msg["References"] = in_reply_to
            
        # Standard follow-up email threading subject prefix
        if not subject.lower().startswith("re:"):
            msg["Subject"] = f"Re: {subject}"
        else:
            msg["Subject"] = subject
    else:
        msg["Subject"] = subject
    
    # Attach body
    msg.attach(MIMEText(body, "plain"))
    
    # Attach PDF resume if path is valid
    if resume_path and os.path.exists(resume_path):
        filename = os.path.basename(resume_path)
        try:
            with open(resume_path, "rb") as attachment:
                part = MIMEBase("application", "octet-stream")
                part.set_payload(attachment.read())
            encoders.encode_base64(part)
            part.add_header(
                "Content-Disposition",
                f"attachment; filename={filename}",
            )
            msg.attach(part)
        except Exception as e:
            # Fallback/log, do not crash the compile process
            pass
            
    return msg, msg_id



