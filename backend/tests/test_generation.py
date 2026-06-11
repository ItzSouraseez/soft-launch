import threading
from unittest.mock import MagicMock, patch
from bson import ObjectId
from app.services.ai_generator import run_parallel_generation, generation_jobs

def test_parallel_generation_logic():
    """
    Simulates the concurrent email draft generator with mocked DB and Groq client
    to verify key rotation and tracking logic.
    """
    # 1. Mock DB and collection structures
    mock_db = MagicMock()
    
    recipient_ids = ["60c72b2f9b1d8e2b4c8b4501", "60c72b2f9b1d8e2b4c8b4502", "60c72b2f9b1d8e2b4c8b4503"]
    recipients_db = {
        ObjectId(rid): {"_id": ObjectId(rid), "email": f"rec{i}@example.com", "name": f"Rec{i}"}
        for i, rid in enumerate(recipient_ids)
    }
    
    def mock_find_one(filter_dict):
        oid = filter_dict.get("_id")
        return recipients_db.get(oid)
        
    mock_db.recipients.find_one.side_effect = mock_find_one
    mock_db.blocked_domains.find_one.return_value = None
    
    # 2. Mock Groq Completions and track which rotated keys are accessed
    used_keys = []
    used_keys_lock = threading.Lock()
    
    with patch("app.services.ai_generator.Groq") as MockGroqClass:
        def init_mock_groq(api_key):
            mock_client = MagicMock()
            mock_client.api_key = api_key
            
            mock_response = MagicMock()
            mock_choice = MagicMock()
            mock_choice.message.content = '{"subject": "Mock Subject", "body": "Mock Body text."}'
            mock_response.choices = [mock_choice]
            mock_client.chat.completions.create.return_value = mock_response
            
            with used_keys_lock:
                used_keys.append(api_key)
            return mock_client
            
        MockGroqClass.side_effect = init_mock_groq
        
        # 3. Trigger concurrent generator execution
        campaign_id = "test_camp_50"
        api_keys = ["key-A", "key-B"]
        profile_data = {"full_name": "Developer"}
        campaign_data = {"name": "Test", "goal": "Apply"}
        
        with patch("app.core.db.get_db", return_value=mock_db):
            run_parallel_generation(
                campaign_id_str=campaign_id,
                recipient_ids=recipient_ids,
                api_keys=api_keys,
                profile_data=profile_data,
                campaign_data=campaign_data
            )
            
        # 4. Verify job state changes and counts in job tracker
        assert campaign_id in generation_jobs
        job = generation_jobs[campaign_id]
        assert job["status"] == "completed"
        assert job["total"] == 3
        assert job["success"] == 3
        assert job["failed"] == 0
        
        # Verify key rotation distributed execution
        print("Keys used:", used_keys)
        assert len(used_keys) == 3
        assert "key-A" in used_keys
        assert "key-B" in used_keys
        
        # 3 target recipients * 2 updates per target (generating + completion) = 6 database writes
        assert mock_db.recipients.update_one.call_count == 6
        print("Parallel generation runner logic verified successfully.")

if __name__ == "__main__":
    test_parallel_generation_logic()
