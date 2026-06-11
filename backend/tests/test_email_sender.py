import os
import unittest
from unittest.mock import MagicMock, patch
from bson import ObjectId
from app.services.email_sender import (
    validate_smtp_credentials,
    compile_email,
    run_bulk_send,
    get_smtp_config
)

def test_validate_smtp_credentials():
    """
    Verifies that validate_smtp_credentials connects, logins, and quits properly.
    """
    mock_server = MagicMock()
    with patch("app.services.email_sender.connect_smtp", return_value=mock_server) as mock_connect:
        config = {
            "email": "test@gmail.com",
            "password": "app-password",
            "host": "smtp.gmail.com",
            "port": 587
        }
        
        # Test success case
        success, msg = validate_smtp_credentials(config)
        assert success is True
        mock_server.login.assert_called_once_with("test@gmail.com", "app-password")
        mock_server.quit.assert_called_once()
        
        # Test auth failure
        import smtplib
        mock_server.login.side_effect = smtplib.SMTPAuthenticationError(535, "Auth failed")
        success, msg = validate_smtp_credentials(config)
        assert success is False
        assert "Authentication failed" in msg
    print("test_validate_smtp_credentials passed.")

def test_compile_email():
    """
    Verifies MIME email compilation, message ID generation, attachment handling, and threading.
    """
    from email.mime.multipart import MIMEMultipart
    
    # 1. Standard email without thread headers
    msg, msg_id = compile_email(
        from_email="sender@example.com",
        to_email="receiver@example.com",
        subject="Hello",
        body="This is a body",
        resume_path=None
    )
    assert isinstance(msg, MIMEMultipart)
    assert msg["From"] == "sender@example.com"
    assert msg["To"] == "receiver@example.com"
    assert msg["Subject"] == "Hello"
    assert msg_id is not None
    
    # 2. Threaded email with references and In-Reply-To
    msg_reply, reply_id = compile_email(
        from_email="sender@example.com",
        to_email="receiver@example.com",
        subject="Hello",
        body="This is follow up",
        resume_path=None,
        in_reply_to="<parent-id@gmail.com>",
        references="<older-id@gmail.com>"
    )
    assert msg_reply["In-Reply-To"] == "<parent-id@gmail.com>"
    assert msg_reply["References"] == "<older-id@gmail.com> <parent-id@gmail.com>"
    assert msg_reply["Subject"] == "Re: Hello"
    print("test_compile_email passed.")

@patch("app.services.email_sender.get_db")
@patch("app.services.email_sender.connect_smtp")
@patch("app.services.email_sender.get_settings")
def test_run_bulk_send(mock_settings, mock_connect, mock_get_db):
    """
    Tests bulk sending process loop: including DB queries, connection logic, blocked domains, and delays.
    """
    mock_db = MagicMock()
    mock_get_db.return_value = mock_db
    mock_settings.return_value = {
        "send_delay_min": 0,
        "send_delay_max": 0
    }
    
    # Mock campaign and recipients search
    campaign_id = "60c72b2f9b1d8e2b4c8b4567"
    mock_db.campaigns.find_one.return_value = {
        "_id": ObjectId(campaign_id),
        "name": "Test Campaign",
        "status": "draft"
    }
    mock_db.recipients.find.return_value = [
        {
            "_id": ObjectId("60c72b2f9b1d8e2b4c8b4568"),
            "email": "allowed@company.com",
            "mail_subject": "Allowed Subj",
            "mail_body": "Allowed Body"
        },
        {
            "_id": ObjectId("60c72b2f9b1d8e2b4c8b4569"),
            "email": "blocked@spam.com",
            "mail_subject": "Blocked Subj",
            "mail_body": "Blocked Body"
        }
    ]
    
    # Mock blocked_domains lookup
    def mock_find_one_blocked(query):
        if query.get("domain") == "spam.com":
            return {"domain": "spam.com"}
        return None
    mock_db.blocked_domains.find_one.side_effect = mock_find_one_blocked
    
    # Mock SMTP connect/login
    mock_smtp = MagicMock()
    mock_connect.return_value = mock_smtp
    
    smtp_config = {
        "email": "sender@example.com",
        "password": "password",
        "host": "smtp.example.com",
        "port": 587
    }
    
    run_bulk_send(campaign_id, smtp_config, resume_path=None)
    
    # Check SMTP send count: should only send 1 (since the other is blocked)
    assert mock_smtp.send_message.call_count == 1
    
    # Check DB update counts
    assert mock_db.recipients.update_one.call_count == 2
    # Check update status sent
    sent_update_call = mock_db.recipients.update_one.call_args_list[0]
    assert sent_update_call[0][0]["_id"] == ObjectId("60c72b2f9b1d8e2b4c8b4568")
    assert sent_update_call[0][1]["$set"]["status"] == "sent"
    
    # Check update status blocked
    blocked_update_call = mock_db.recipients.update_one.call_args_list[1]
    assert blocked_update_call[0][0]["_id"] == ObjectId("60c72b2f9b1d8e2b4c8b4569")
    assert blocked_update_call[0][1]["$set"]["status"] == "blocked"
    print("test_run_bulk_send passed.")

if __name__ == "__main__":
    test_validate_smtp_credentials()
    test_compile_email()
    test_run_bulk_send()
    print("All email sender service unit tests passed successfully!")
