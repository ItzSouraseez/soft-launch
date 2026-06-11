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


import threading
import time
import random
from datetime import datetime
from bson import ObjectId
from app.core.db import get_db

# In-memory sending jobs tracker
sending_jobs = {}
sending_jobs_lock = threading.Lock()

def run_bulk_send(campaign_id_str: str, smtp_config: dict, resume_path: str = None):
    """
    Background worker that connects to SMTP, iterates through campaign recipient drafts,
    checks blocked domains, compiles MIME emails, dispatches them, updates DB statuses,
    and applies random delays between emails.
    """
    db = get_db()
    try:
        campaign_oid = ObjectId(campaign_id_str)
    except Exception as e:
        with sending_jobs_lock:
            sending_jobs[campaign_id_str] = {
                "status": "failed",
                "error": f"Invalid campaign ID format: {str(e)}",
                "processed": 0,
                "total": 0
            }
        return

    # Find campaign
    campaign = db.campaigns.find_one({"_id": campaign_oid})
    if not campaign:
        with sending_jobs_lock:
            sending_jobs[campaign_id_str] = {
                "status": "failed",
                "error": "Campaign not found",
                "processed": 0,
                "total": 0
            }
        return

    # Fetch recipients in draft status
    recipients = list(db.recipients.find({
        "campaign_id": campaign_oid,
        "status": "draft"
    }))

    total = len(recipients)
    
    with sending_jobs_lock:
        sending_jobs[campaign_id_str] = {
            "status": "running",
            "total": total,
            "processed": 0,
            "sent": 0,
            "failed": 0,
            "blocked": 0,
            "errors": []
        }

    if total == 0:
        with sending_jobs_lock:
            sending_jobs[campaign_id_str]["status"] = "completed"
        # Update campaign status
        db.campaigns.update_one(
            {"_id": campaign_oid},
            {"$set": {"status": "sent"}}
        )
        return

    # Update campaign status to active sending
    db.campaigns.update_one(
        {"_id": campaign_oid},
        {"$set": {"status": "sending"}}
    )

    # Establish SMTP connection
    server = None
    try:
        server = connect_smtp(smtp_config)
        server.login(smtp_config["email"], smtp_config["password"])
    except Exception as e:
        error_msg = f"SMTP Login failed: {str(e)}"
        with sending_jobs_lock:
            sending_jobs[campaign_id_str]["status"] = "failed"
            sending_jobs[campaign_id_str]["errors"].append(error_msg)
        db.campaigns.update_one(
            {"_id": campaign_oid},
            {"$set": {"status": "failed"}}
        )
        return

    # Fetch delays
    settings = get_settings()
    delay_min = int(settings.get("send_delay_min", 30))
    delay_max = int(settings.get("send_delay_max", 60))

    try:
        for idx, rec in enumerate(recipients):
            rec_id_str = str(rec["_id"])
            rec_email = rec["email"]
            subject = rec.get("mail_subject", "")
            body = rec.get("mail_body", "")

            # Ensure subject/body are not empty (could happen if AI generation was skipped/failed)
            if not subject or not body:
                error_msg = f"Recipient {rec_email} is missing email subject or body. Skipping."
                db.recipients.update_one(
                    {"_id": rec["_id"]},
                    {"$set": {"status": "failed", "error_message": error_msg}}
                )
                db.campaigns.update_one(
                    {"_id": campaign_oid},
                    {"$inc": {"failed_count": 1}}
                )
                with sending_jobs_lock:
                    job = sending_jobs[campaign_id_str]
                    job["processed"] += 1
                    job["failed"] += 1
                    job["errors"].append(error_msg)
                continue

            # Check if domain is blocked
            email_domain = rec_email.split("@")[-1].strip().lower()
            is_blocked = db.blocked_domains.find_one({"domain": email_domain})
            
            if is_blocked:
                db.recipients.update_one(
                    {"_id": rec["_id"]},
                    {"$set": {"status": "blocked", "error_message": "Domain is in blocked list."}}
                )
                db.campaigns.update_one(
                    {"_id": campaign_oid},
                    {"$inc": {"failed_count": 1}} # Increment failed or add bounce? Let's count blocked as failed/skipped
                )
                with sending_jobs_lock:
                    job = sending_jobs[campaign_id_str]
                    job["processed"] += 1
                    job["blocked"] += 1
                continue

            # Connect check: re-connect if SMTP connection was lost
            if not server:
                try:
                    server = connect_smtp(smtp_config)
                    server.login(smtp_config["email"], smtp_config["password"])
                except Exception as conn_err:
                    error_msg = f"SMTP Reconnection failed: {str(conn_err)}"
                    db.recipients.update_one(
                        {"_id": rec["_id"]},
                        {"$set": {"status": "failed", "error_message": error_msg}}
                    )
                    db.campaigns.update_one(
                        {"_id": campaign_oid},
                        {"$inc": {"failed_count": 1}}
                    )
                    with sending_jobs_lock:
                        job = sending_jobs[campaign_id_str]
                        job["processed"] += 1
                        job["failed"] += 1
                        job["errors"].append(error_msg)
                    continue

            # Build and compile message
            try:
                # Followup variables (if any exist)
                in_reply_to = rec.get("in_reply_to")
                references = rec.get("references")
                
                msg, msg_id = compile_email(
                    from_email=smtp_config["email"],
                    to_email=rec_email,
                    subject=subject,
                    body=body,
                    resume_path=resume_path,
                    in_reply_to=in_reply_to,
                    references=references
                )
                
                # Send the email
                server.send_message(msg)
                
                # Update DB recipient to sent
                db.recipients.update_one(
                    {"_id": rec["_id"]},
                    {
                        "$set": {
                            "status": "sent",
                            "sent_at": datetime.utcnow(),
                            "message_id": msg_id,
                            "error_message": None
                        }
                    }
                )
                
                # Increment campaign stats
                db.campaigns.update_one(
                    {"_id": campaign_oid},
                    {"$inc": {"sent_count": 1}}
                )

                with sending_jobs_lock:
                    job = sending_jobs[campaign_id_str]
                    job["processed"] += 1
                    job["sent"] += 1

            except Exception as send_err:
                error_msg = f"Failed to send email to {rec_email}: {str(send_err)}"
                db.recipients.update_one(
                    {"_id": rec["_id"]},
                    {"$set": {"status": "failed", "error_message": error_msg}}
                )
                db.campaigns.update_one(
                    {"_id": campaign_oid},
                    {"$inc": {"failed_count": 1}}
                )
                with sending_jobs_lock:
                    job = sending_jobs[campaign_id_str]
                    job["processed"] += 1
                    job["failed"] += 1
                    job["errors"].append(error_msg)
                
                # Close server if connection broke
                try:
                    server.quit()
                except Exception:
                    pass
                server = None

            # Apply delay between emails if not the last email
            if idx < total - 1:
                delay = random.uniform(delay_min, delay_max)
                time.sleep(delay)

    finally:
        if server:
            try:
                server.quit()
            except Exception:
                pass

        # Mark job completed
        with sending_jobs_lock:
            if sending_jobs[campaign_id_str]["status"] == "running":
                sending_jobs[campaign_id_str]["status"] = "completed"

        # Update final campaign status
        db.campaigns.update_one(
            {"_id": campaign_oid},
            {"$set": {"status": "sent"}}
        )




