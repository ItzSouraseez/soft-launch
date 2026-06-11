import unittest
from unittest.mock import MagicMock, patch
from bson import ObjectId
from datetime import datetime

# Import components to test
from app.api.followups import get_eligible_recipients_list
from app.services.ai_generator import build_followup_prompt
from app.services.email_sender import run_followup_send

@patch("app.api.followups.db")
def test_get_eligible_recipients_list(mock_db):
    """
    Verifies that get_eligible_recipients_list correctly identifies recipients
    in sent/ooo/replied status and excludes those that already have followups.
    """
    campaign_oid = ObjectId("60c72b2f9b1d8e2b4c8b4567")
    
    # 1. Mock recipients list
    rec1_id = ObjectId("60c72b2f9b1d8e2b4c8b4561")
    rec2_id = ObjectId("60c72b2f9b1d8e2b4c8b4562")
    rec3_id = ObjectId("60c72b2f9b1d8e2b4c8b4563")
    
    mock_db.recipients.find.return_value = [
        {"_id": rec1_id, "email": "r1@example.com", "status": "sent", "campaign_id": campaign_oid},
        {"_id": rec2_id, "email": "r2@example.com", "status": "ooo", "campaign_id": campaign_oid},
        {"_id": rec3_id, "email": "r3@example.com", "status": "replied", "campaign_id": campaign_oid}
    ]
    
    # 2. Mock existing followups: rec2 already has a mockup followup
    mock_db.followups.find.return_value = [
        {"recipient_id": rec2_id, "campaign_id": campaign_oid, "status": "draft"}
    ]
    
    eligible = get_eligible_recipients_list(campaign_oid)
    
    # Should include rec1 and rec3, but exclude rec2
    assert len(eligible) == 2
    eligible_ids = [r["_id"] for r in eligible]
    assert rec1_id in eligible_ids
    assert rec3_id in eligible_ids
    assert rec2_id not in eligible_ids
    
    print("test_get_eligible_recipients_list passed.")

def test_build_followup_prompt():
    """
    Verifies build_followup_prompt includes correct instructions based on recipient statuses.
    """
    profile = {
        "full_name": "John Doe",
        "title": "Software Engineer",
        "bio": "I write code.",
        "skills": ["Python", "FastAPI"]
    }
    
    # Test 'sent' status (No Reply)
    prompt_sent = build_followup_prompt(
        recipient_name="Recruiter",
        recipient_status="sent",
        original_subject="Software Engineer Role",
        original_body="Initial email body",
        profile=profile
    )
    assert "The recipient has not replied to our initial email" in prompt_sent
    assert "Software Engineer Role" in prompt_sent
    
    # Test 'ooo' status (Out of Office)
    prompt_ooo = build_followup_prompt(
        recipient_name="Recruiter",
        recipient_status="ooo",
        original_subject="Software Engineer Role",
        original_body="Initial email body",
        ooo_return_date="2026-07-01",
        profile=profile
    )
    assert "will return on 2026-07-01" in prompt_ooo
    assert "Out of Office reply" in prompt_ooo
    
    # Test 'replied' status (Contextual response)
    prompt_replied = build_followup_prompt(
        recipient_name="Recruiter",
        recipient_status="replied",
        original_subject="Software Engineer Role",
        original_body="Initial email body",
        incoming_email_body="No active openings right now",
        sentiment="negative",
        profile=profile
    )
    assert "No active openings right now" in prompt_replied
    assert "negative" in prompt_replied
    
    print("test_build_followup_prompt passed.")

@patch("app.services.email_sender.get_db")
@patch("app.services.email_sender.connect_smtp")
@patch("app.services.email_sender.get_settings")
def test_run_followup_send(mock_settings, mock_connect, mock_get_db):
    """
    Verifies that run_followup_send correctly loads followup drafts,
    links them to their parent thread message_id, sends the email,
    and updates databases.
    """
    mock_db = MagicMock()
    mock_get_db.return_value = mock_db
    mock_settings.return_value = {
        "send_delay_min": 0,
        "send_delay_max": 0
    }
    
    campaign_id = "60c72b2f9b1d8e2b4c8b4567"
    rec_id = ObjectId("60c72b2f9b1d8e2b4c8b4561")
    fup_id = ObjectId("60c72b2f9b1d8e2b4c8b4562")
    
    # Mock campaign
    mock_db.campaigns.find_one.return_value = {
        "_id": ObjectId(campaign_id),
        "name": "Test Campaign"
    }
    
    # Mock followups query
    mock_db.followups.find.return_value = [
        {
            "_id": fup_id,
            "campaign_id": ObjectId(campaign_id),
            "recipient_id": rec_id,
            "email": "receiver@example.com",
            "mail_subject": "Re: Software Engineer Role",
            "mail_body": "This is follow up body",
            "status": "draft"
        }
    ]
    
    # Mock matching parent recipient to verify threading linkage
    mock_db.recipients.find_one.return_value = {
        "_id": rec_id,
        "email": "receiver@example.com",
        "message_id": "<parent-message-id@example.com>"
    }
    
    # Mock blocked_domains lookup
    mock_db.blocked_domains.find_one.return_value = None
    
    # Mock SMTP server
    mock_smtp = MagicMock()
    mock_connect.return_value = mock_smtp
    
    smtp_config = {
        "email": "sender@example.com",
        "password": "password",
        "host": "smtp.example.com",
        "port": 587
    }
    
    run_followup_send(campaign_id, smtp_config, resume_path=None)
    
    # Verify SMTP sent message and message compiles properly
    assert mock_smtp.send_message.call_count == 1
    
    # Inspect arguments compiled in sent message
    sent_msg = mock_smtp.send_message.call_args[0][0]
    assert sent_msg["In-Reply-To"] == "<parent-message-id@example.com>"
    assert sent_msg["References"] == "<parent-message-id@example.com>"
    
    # Verify followup database status updated to sent
    mock_db.followups.update_one.assert_called_once()
    fup_call_args = mock_db.followups.update_one.call_args[0]
    assert fup_call_args[0]["_id"] == fup_id
    assert fup_call_args[1]["$set"]["status"] == "sent"
    
    # Verify recipient database metadata updated with last followup sent date and message_id
    mock_db.recipients.update_one.assert_called_once()
    rec_call_args = mock_db.recipients.update_one.call_args[0]
    assert rec_call_args[0]["_id"] == rec_id
    assert "last_followup_sent_at" in rec_call_args[1]["$set"]
    assert "last_followup_message_id" in rec_call_args[1]["$set"]
    
    print("test_run_followup_send passed.")

if __name__ == "__main__":
    test_get_eligible_recipients_list()
    test_build_followup_prompt()
    test_run_followup_send()
    print("All follow-up service unit tests passed successfully!")
