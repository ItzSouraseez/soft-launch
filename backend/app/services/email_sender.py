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

