import os
import unittest
from datetime import datetime
from unittest.mock import MagicMock, patch
from bson import ObjectId
from app.api.crm import (
    search_contacts,
    get_contact_history,
    get_reply_stats,
    get_reengagement_candidates,
    add_blocked_domain,
    remove_blocked_domain,
    get_blocked_domains,
    update_recipient_status_manually,
    BlockedDomainRequest,
    RecipientStatusPatchRequest
)

@patch("app.api.crm.db")
def test_search_contacts(mock_db):
    """
    Verifies that search_contacts returns a paginated list of recipients and maps campaign names.
    """
    mock_db.recipients.count_documents.return_value = 1
    mock_db.recipients.find.return_value.sort.return_value.skip.return_value.limit.return_value = [
        {
            "_id": ObjectId("60c72b2f9b1d8e2b4c8b4568"),
            "campaign_id": ObjectId("60c72b2f9b1d8e2b4c8b4567"),
            "email": "test@company.com",
            "name": "Jane Doe",
            "status": "sent"
        }
    ]
    mock_db.campaigns.find.return_value = [
        {"_id": ObjectId("60c72b2f9b1d8e2b4c8b4567"), "name": "Company Career Outreach"}
    ]
    
    result = search_contacts(q="Jane", page=1, limit=10)
    assert result["total"] == 1
    assert len(result["results"]) == 1
    assert result["results"][0]["campaign_name"] == "Company Career Outreach"
    assert result["results"][0]["email"] == "test@company.com"
    print("test_search_contacts passed.")

@patch("app.api.crm.db")
def test_get_contact_history(mock_db):
    """
    Verifies that get_contact_history fetches matching recipient events and domain aggregates.
    """
    c_id = ObjectId()
    
    mock_cursor = MagicMock()
    mock_cursor.sort.return_value = [
        {
            "_id": ObjectId("60c72b2f9b1d8e2b4c8b4568"),
            "campaign_id": c_id,
            "email": "lead@company.com",
            "name": "Alex",
            "status": "replied",
            "created_at": datetime(2026, 6, 10, 10, 0),
            "sent_at": datetime(2026, 6, 10, 10, 5),
            "replied_at": datetime(2026, 6, 11, 12, 0),
            "reply_sentiment": "positive"
        }
    ]
    
    # First call uses find().sort(), second call uses find() directly
    mock_db.recipients.find.side_effect = [
        mock_cursor,
        [
            {
                "email": "other@company.com",
                "name": "Other recruiter",
                "status": "sent",
                "campaign_id": c_id
            }
        ]
    ]
    
    mock_db.campaigns.find.return_value = [
        {"_id": c_id, "name": "Google Campaign", "goal": "Hiring"}
    ]

    
    result = get_contact_history(email="lead@company.com")
    assert result["email"] == "lead@company.com"
    assert len(result["history"]) == 1
    assert result["history"][0]["campaign_name"] == "Google Campaign"
    assert len(result["history"][0]["events"]) == 3  # created, sent, replied
    assert len(result["other_domain_leads"]) == 1
    assert result["other_domain_leads"][0]["email"] == "other@company.com"
    print("test_get_contact_history passed.")

@patch("app.api.crm.db")
def test_get_reply_stats(mock_db):
    """
    Verifies dashboard statistics and rates are computed correctly.
    """
    mock_db.recipients.count_documents.side_effect = [
        100,  # total_sent
        20,   # total_replied
        5,    # total_ooo
        10,   # total_bounced
        12,   # positive sentiment
        8,    # negative sentiment
        0     # neutral
    ]
    
    result = get_reply_stats()
    metrics = result["metrics"]
    assert metrics["total_sent"] == 100
    assert metrics["reply_rate"] == 20.0
    assert metrics["ooo_rate"] == 5.0
    assert metrics["bounce_rate"] == 10.0
    assert result["sentiment_breakdown"]["positive"]["percentage"] == 60.0
    print("test_get_reply_stats passed.")

@patch("app.api.crm.db")
def test_get_reengagement_candidates(mock_db):
    """
    Verifies reengagement lists correctly filter candidates without followups.
    """
    c_id = ObjectId()
    rec_id1 = ObjectId()
    rec_id2 = ObjectId()
    
    # Mock sent recipients older than 3 days
    mock_db.recipients.find.return_value = [
        {"_id": rec_id1, "email": "r1@test.com", "campaign_id": c_id, "sent_at": datetime(2026, 6, 1)},
        {"_id": rec_id2, "email": "r2@test.com", "campaign_id": c_id, "sent_at": datetime(2026, 6, 1)}
    ]
    
    # Mock followups: r1 already has a followup, r2 does not
    mock_db.followups.find.return_value = [{"recipient_id": rec_id1}]
    mock_db.campaigns.find.return_value = [{"_id": c_id, "name": "Outreach Campaign"}]
    
    result = get_reengagement_candidates(days_limit=3)
    assert len(result) == 1
    assert result[0]["email"] == "r2@test.com"
    print("test_get_reengagement_candidates passed.")

@patch("app.api.crm.db")
def test_blocked_domains_controls(mock_db):
    """
    Verifies adding, deleting, and listing blocked domains collections.
    """
    # Test adding new domain
    mock_db.blocked_domains.find_one.return_value = None
    mock_db.blocked_domains.insert_one.return_value = None
    
    payload = BlockedDomainRequest(domain="spam.com")
    res_add = add_blocked_domain(payload)
    assert res_add["domain"] == "spam.com"
    mock_db.blocked_domains.insert_one.assert_called_once()
    
    # Test listing blocked domains
    mock_db.blocked_domains.find.return_value.sort.return_value = [
        {"_id": ObjectId(), "domain": "spam.com", "created_at": datetime.utcnow()}
    ]
    res_list = get_blocked_domains()
    assert len(res_list) == 1
    assert res_list[0]["domain"] == "spam.com"
    
    # Test removing blocked domain
    mock_del_res = MagicMock()
    mock_del_res.deleted_count = 1
    mock_db.blocked_domains.delete_one.return_value = mock_del_res
    res_del = remove_blocked_domain("spam.com")
    assert res_del["domain"] == "spam.com"
    mock_db.blocked_domains.delete_one.assert_called_with({"domain": "spam.com"})
    print("test_blocked_domains_controls passed.")

@patch("app.api.crm.db")
def test_update_recipient_status_manually(mock_db):
    """
    Verifies that manual overrides update recipient values and adjust campaign statistics.
    """
    rec_id = ObjectId()
    camp_id = ObjectId()
    
    # Mock finding recipient
    mock_db.recipients.find_one.return_value = {
        "_id": rec_id,
        "campaign_id": camp_id,
        "status": "sent"
    }
    
    payload = RecipientStatusPatchRequest(status="replied", reply_sentiment="positive")
    result = update_recipient_status_manually(str(rec_id), payload)
    
    assert result["recipient_id"] == str(rec_id)
    # Check that it updated recipient status
    mock_db.recipients.update_one.assert_called_once()
    assert mock_db.recipients.update_one.call_args[0][0]["_id"] == rec_id
    
    # Check that it decremented sent_count and incremented reply_count in campaigns
    mock_db.campaigns.update_one.assert_called_once_with(
        {"_id": camp_id},
        {"$inc": {"sent_count": -1, "reply_count": 1}}
    )
    print("test_update_recipient_status_manually passed.")

if __name__ == "__main__":
    test_search_contacts()
    test_get_contact_history()
    test_get_reply_stats()
    test_get_reengagement_candidates()
    test_blocked_domains_controls()
    test_update_recipient_status_manually()
    print("All CRM and exclusions API unit tests passed successfully!")
