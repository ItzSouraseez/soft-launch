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

def compile_email(from_email: str, to_email: str, subject: str, body: str, resume_path: str = None) -> MIMEMultipart:
    """
    Compiles a MIME email message. Optionally attaches a PDF resume if resume_path is provided.
    """
    msg = MIMEMultipart()
    msg["From"] = from_email
    msg["To"] = to_email
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
                f"attachment; filename= {filename}",
            )
            msg.attach(part)
        except Exception as e:
            # Fallback/log, do not crash the compile process
            pass
            
    return msg


