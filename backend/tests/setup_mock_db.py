import sys
import os
from datetime import datetime, timedelta
from bson import ObjectId

# Append backend app directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.db import get_db

def setup_mock_database():
    """
    Sets up local outreach_db with rich mock collections and documents for system testing.
    """
    print("Connecting to MongoDB local instance...")
    db = get_db()
    
    # 1. Clear existing collections
    print("Clearing collections...")
    db.settings.delete_many({})
    db.campaigns.delete_many({})
    db.recipients.delete_many({})
    db.blocked_domains.delete_many({})
    db.followups.delete_many({})
    db.processed_incoming_emails.delete_many({})
    
    # 2. Insert Settings
    print("Inserting mock settings configuration...")
    settings_doc = {
        "groq_api_keys": ["gsk_mock_api_key_rotator_alpha_12345", "gsk_mock_api_key_rotator_beta_67890"],
        "smtp_email": "mock-sender@gmail.com",
        "smtp_password": "mock_smtp_app_password_value",
        "smtp_host": "smtp.gmail.com",
        "smtp_port": 587,
        "imap_email": "mock-sender@gmail.com",
        "imap_password": "mock_imap_app_password_value",
        "imap_host": "imap.gmail.com",
        "imap_port": 993,
        "send_delay_min": 1,
        "send_delay_max": 3
    }
    db.settings.insert_one(settings_doc)
    
    # 3. Insert Blocked Domains
    print("Inserting mock blocked domains...")
    blocked_docs = [
        {"domain": "competitor.com", "created_at": datetime.utcnow()},
        {"domain": "ex-employer.com", "created_at": datetime.utcnow()},
        {"domain": "donotcontact.org", "created_at": datetime.utcnow()}
    ]
    db.blocked_domains.insert_many(blocked_docs)
    
    # 4. Insert Campaigns
    print("Inserting mock outreach campaigns...")
    c1_id = ObjectId()
    c2_id = ObjectId()
    
    campaign_docs = [
        {
            "_id": c1_id,
            "name": "Software Engineering Outreach",
            "goal": "Secure software developer internships or full-time roles.",
            "status": "active",
            "total_recipients": 6,
            "sent_count": 2,
            "failed_count": 1,
            "reply_count": 1,
            "ooo_count": 1,
            "bounce_count": 1,
            "created_at": datetime.utcnow() - timedelta(days=10)
        },
        {
            "_id": c2_id,
            "name": "AI/ML Research Outreach",
            "goal": "Connect with AI lab directors for research engineer opportunities.",
            "status": "idle",
            "total_recipients": 3,
            "sent_count": 0,
            "failed_count": 0,
            "reply_count": 0,
            "ooo_count": 0,
            "bounce_count": 0,
            "created_at": datetime.utcnow() - timedelta(days=2)
        }
    ]
    db.campaigns.insert_many(campaign_docs)
    
    # 5. Insert Recipients
    print("Inserting mock recipients...")
    r1_id = ObjectId()
    r2_id = ObjectId()
    r3_id = ObjectId()
    r4_id = ObjectId()
    r5_id = ObjectId()
    r6_id = ObjectId()
    
    r_docs = [
        # Campaign 1 Recipients
        {
            "_id": r1_id,
            "campaign_id": c1_id,
            "email": "hiring@google.com",
            "name": "Sunder Pichai",
            "status": "replied",
            "mail_subject": "SDE Internship Inquiry - SoftLaunch developer",
            "mail_body": "Hello Sunder,\nI parsed your career portal and would love to chat.",
            "sent_at": datetime.utcnow() - timedelta(days=5),
            "replied_at": datetime.utcnow() - timedelta(days=4),
            "reply_sentiment": "positive",
            "check_back_date": (datetime.utcnow() + timedelta(days=5)).strftime("%Y-%m-%d"),
            "exclude_followup": False,
            "created_at": datetime.utcnow() - timedelta(days=10)
        },
        {
            "_id": r2_id,
            "campaign_id": c1_id,
            "email": "recruiter@meta.com",
            "name": "Mark Zuckerberg",
            "status": "ooo",
            "mail_subject": "SDE Internship Inquiry - SoftLaunch developer",
            "mail_body": "Hello Mark,\nI love PyTorch and React. Can we sync?",
            "sent_at": datetime.utcnow() - timedelta(days=7),
            "replied_at": datetime.utcnow() - timedelta(days=7),
            "ooo_return_date": (datetime.utcnow() + timedelta(days=14)).strftime("%Y-%m-%d"),
            "check_back_date": (datetime.utcnow() + timedelta(days=14)).strftime("%Y-%m-%d"),
            "exclude_followup": False,
            "created_at": datetime.utcnow() - timedelta(days=10)
        },
        {
            "_id": r3_id,
            "campaign_id": c1_id,
            "email": "ceo@competitor.com",
            "name": "Competitor Exec",
            "status": "blocked",
            "error_message": "Domain is in blocked exclusion lists.",
            "created_at": datetime.utcnow() - timedelta(days=10)
        },
        {
            "_id": r4_id,
            "campaign_id": c1_id,
            "email": "hr@startup.co",
            "name": "Alice Green",
            "status": "sent",
            "mail_subject": "SDE Internship Inquiry - SoftLaunch developer",
            "mail_body": "Hi Alice,\nI built an agent tool and would love to join your team.",
            "sent_at": datetime.utcnow() - timedelta(days=4),
            "exclude_followup": False,
            "created_at": datetime.utcnow() - timedelta(days=10)
        },
        {
            "_id": r5_id,
            "campaign_id": c1_id,
            "email": "invalid-address@bounced.com",
            "name": "Bounced Recruiter",
            "status": "bounced",
            "error_message": "550 5.1.1 User Unknown",
            "sent_at": datetime.utcnow() - timedelta(days=9),
            "replied_at": datetime.utcnow() - timedelta(days=9),
            "created_at": datetime.utcnow() - timedelta(days=10)
        },
        {
            "_id": r6_id,
            "campaign_id": c1_id,
            "email": "hr@ex-employer.com",
            "name": "Former Boss",
            "status": "failed",
            "error_message": "Blocked domain check triggered.",
            "created_at": datetime.utcnow() - timedelta(days=10)
        },
        
        # Campaign 2 Recipients (Drafts)
        {
            "campaign_id": c2_id,
            "email": "lab-director@openai.com",
            "name": "Sam Altman",
            "status": "draft",
            "mail_subject": "[DRAFT] AI Research Residency Inquiry",
            "mail_body": "[DRAFT] Dear Sam,\nI am excited about AGI...",
            "created_at": datetime.utcnow() - timedelta(days=2)
        },
        {
            "campaign_id": c2_id,
            "email": "lead@anthropic.com",
            "name": "Dario Amodei",
            "status": "draft",
            "mail_subject": "[DRAFT] AI Research Residency Inquiry",
            "mail_body": "[DRAFT] Dear Dario,\nI study safety alignment...",
            "created_at": datetime.utcnow() - timedelta(days=2)
        }
    ]
    db.recipients.insert_many(r_docs)
    
    # 6. Insert Mock Followup Drafts
    print("Inserting mock followups...")
    followup_docs = [
        {
            "recipient_id": r4_id,
            "campaign_id": c1_id,
            "status": "draft",
            "mail_subject": "Re: SDE Internship Inquiry - SoftLaunch developer",
            "mail_body": "Hi Alice,\nJust following up on my previous message to see if there is any interest.",
            "created_at": datetime.utcnow()
        }
    ]
    db.followups.insert_many(followup_docs)
    
    print("\nDatabase mock setup completed successfully!")
    print(f"Campaigns inserted: {len(campaign_docs)}")
    print(f"Recipients inserted: {len(r_docs)}")
    print(f"Followup drafts inserted: {len(followup_docs)}")
    print(f"Blocked domains rule count: {len(blocked_docs)}")

if __name__ == "__main__":
    setup_mock_database()
