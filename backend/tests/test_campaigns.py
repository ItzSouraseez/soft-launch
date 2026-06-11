from unittest.mock import MagicMock, patch
from bson import ObjectId
from app.services.email_parser import parse_recipient_string, deduplicate_recipients

def test_parser_and_deduplicate():
    """
    Verifies that the recipient parser extracts names and emails,
    and the deduplicator handles duplicates case-insensitively while preserving order.
    """
    raw_text = """
    John <john@example.com>
    john@example.com
    Jane <JANE@example.com>
    """
    recipients = parse_recipient_string(raw_text)
    assert len(recipients) == 3
    
    deduped = deduplicate_recipients(recipients)
    assert len(deduped) == 2
    assert deduped[0]["email"] == "john@example.com"
    assert deduped[0]["name"] == "John"
    assert deduped[1]["email"] == "jane@example.com"
    assert deduped[1]["name"] == "Jane"
    print("Email parser and deduplicator test passed.")

@patch("app.api.campaigns.db")
def test_check_duplicates(mock_db):
    """
    Verifies the check_duplicates API logic by patching MongoDB query results.
    """
    mock_db.recipients.find.return_value = [
        {"email": "john@example.com", "campaign_id": "camp123", "status": "sent", "name": "John"}
    ]
    mock_db.campaigns.find.return_value = [
        {"_id": "camp123", "name": "Google Software Engineer Campaign"}
    ]
    
    from app.api.campaigns import check_duplicates, DuplicateCheckRequest
    
    payload = DuplicateCheckRequest(recipients_raw="john@example.com")
    result = check_duplicates(payload)
    
    assert result["total_duplicates"] == 1
    assert result["duplicates"][0]["email"] == "john@example.com"
    assert result["duplicates"][0]["campaign_name"] == "Google Software Engineer Campaign"
    print("check_duplicates API logic test passed.")

@patch("app.api.campaigns.db")
@patch("app.api.campaigns.verify_resume_uploaded")
def test_create_campaign(mock_verify, mock_db):
    """
    Verifies that create_campaign extracts emails, inserts metadata and recipients, and returns correct details.
    """
    mock_verify.return_value = {"resume_parsed": True}
    
    # Mock insertion result
    mock_insert_res = MagicMock()
    mock_insert_res.inserted_id = ObjectId("60c72b2f9b1d8e2b4c8b4567")
    mock_db.campaigns.insert_one.return_value = mock_insert_res
    mock_db.recipients.insert_many.return_value = None
    
    from app.api.campaigns import create_campaign, CampaignCreateRequest
    
    payload = CampaignCreateRequest(
        name="Test Campaign",
        goal="Test Goal",
        recipients_raw="test@example.com"
    )
    result = create_campaign(payload)
    
    assert result["total_recipients_imported"] == 1
    assert result["campaign"]["name"] == "Test Campaign"
    assert result["campaign"]["_id"] == "60c72b2f9b1d8e2b4c8b4567"
    print("create_campaign API logic test passed.")

if __name__ == "__main__":
    test_parser_and_deduplicate()
    test_check_duplicates()
    test_create_campaign()
    print("All campaigns API unit tests passed successfully!")
