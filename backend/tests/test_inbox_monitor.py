import os
import unittest
from unittest.mock import MagicMock, patch
from bson import ObjectId
from app.services.inbox_monitor import (
    clean_html,
    extract_email_body,
    find_matching_recipient,
    process_incoming_email
)

def test_clean_html():
    """
    Verifies that clean_html removes tags, style block, script block, and HTML entities.
    """
    html_input = """
    <html>
      <head>
        <style>body { color: red; }</style>
      </head>
      <body>
        <div>Hello <a href="#">World</a>!</div>
        <p>This is a &ldquo;test&rdquo;.</p>
        <script>console.log("hello");</script>
      </body>
    </html>
    """
    cleaned = clean_html(html_input)
    assert "body {" not in cleaned
    assert "console.log" not in cleaned
    assert "Hello" in cleaned
    assert "World" in cleaned
    assert "This is a" in cleaned
    print("test_clean_html passed.")

def test_extract_email_body():
    """
    Verifies body extraction from simple message objects and HTML fallbacks.
    """
    import email
    from email.mime.text import MIMEText
    
    # Test simple plain text email
    msg_plain = MIMEText("Plain text body", "plain")
    assert extract_email_body(msg_plain) == "Plain text body"
    
    # Test HTML fallback
    msg_html = MIMEText("<div>HTML body</div>", "html")
    assert extract_email_body(msg_html) == "HTML body"
    print("test_extract_email_body passed.")

def test_find_matching_recipient():
    """
    Tests finding recipient in database using In-Reply-To and email address fallbacks.
    """
    mock_db = MagicMock()
    
    # 1. Match by Message-ID (In-Reply-To)
    mock_db.recipients.find_one.return_value = {"email": "match1@test.com", "campaign_id": "c1"}
    headers = {"in_reply_to": "<msg123@sender.com>", "from": "Name <match1@test.com>"}
    
    match = find_matching_recipient(mock_db, headers)
    assert match is not None
    assert match["email"] == "match1@test.com"
    mock_db.recipients.find_one.assert_called_with({"message_id": "<msg123@sender.com>"})
    
    # 2. Match by email fallback
    mock_db.recipients.find_one.side_effect = [None, {"email": "fallback@test.com", "status": "sent"}]
    headers_fallback = {"in_reply_to": "<notfound@sender.com>", "from": "fallback@test.com"}
    
    match_fallback = find_matching_recipient(mock_db, headers_fallback)
    assert match_fallback is not None
    assert match_fallback["email"] == "fallback@test.com"
    print("test_find_matching_recipient passed.")


@patch("app.services.inbox_monitor.classify_incoming_email")
def test_process_incoming_email(mock_classify):
    """
    Verifies that process_incoming_email runs classification, updates recipient status
    (replied, ooo, bounced), increments campaign counters, and logs processed emails.
    """
    mock_db = MagicMock()
    
    # Set duplicate check to None (not processed yet)
    mock_db.processed_incoming_emails.find_one.return_value = None
    
    # Mock matching recipient
    campaign_id = ObjectId()
    recipient_id = ObjectId()
    mock_recipient = {
        "_id": recipient_id,
        "campaign_id": campaign_id,
        "email": "lead@company.com",
        "status": "sent"
    }
    
    # We patch find_matching_recipient
    with patch("app.services.inbox_monitor.find_matching_recipient", return_value=mock_recipient):
        headers = {"message_id": "<msg789>", "from": "lead@company.com", "subject": "Out of Office"}
        body = "I am currently away."
        
        # Mock OOO classification response
        mock_classify.return_value = {
            "category": "ooo",
            "sentiment": None,
            "bounce_reason": None,
            "return_date": "2026-07-01"
        }
        
        process_incoming_email(mock_db, headers, body, api_key="dummy_key")
        
        # Verify database updates
        mock_db.recipients.update_one.assert_called_once()
        update_call_arg = mock_db.recipients.update_one.call_args[0]
        assert update_call_arg[0]["_id"] == recipient_id
        assert update_call_arg[1]["$set"]["status"] == "ooo"
        assert update_call_arg[1]["$set"]["ooo_return_date"] == "2026-07-01"
        
        # Verify campaign increment
        mock_db.campaigns.update_one.assert_called_once_with(
            {"_id": campaign_id},
            {"$inc": {"ooo_count": 1}}
        )
        
        # Verify registered as processed
        mock_db.processed_incoming_emails.insert_one.assert_called_once()
        
    print("test_process_incoming_email passed.")

if __name__ == "__main__":
    test_clean_html()
    test_extract_email_body()
    test_find_matching_recipient()
    test_process_incoming_email()
    print("All inbox monitor unit tests passed successfully!")
