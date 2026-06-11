import os
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from app.core.db import get_db
from app.core.config_manager import get_profile
from app.services.email_parser import parse_recipient_string, deduplicate_recipients

db = get_db()
router = APIRouter(prefix="/api", tags=["campaigns"])

def verify_resume_uploaded():
    """
    Helper function to verify that the user has uploaded and parsed their resume.
    Raises HTTPException if not.
    """
    profile = get_profile()
    if not profile.get("resume_parsed"):
        raise HTTPException(
            status_code=400,
            detail="Resume has not been parsed yet. Please upload and parse your resume first."
        )
    resume_path = profile.get("resume_path")
    if not resume_path or not os.path.exists(resume_path):
        raise HTTPException(
            status_code=400,
            detail="Resume PDF file is missing from disk. Please upload your resume."
        )
    return profile

class RecipientItem(BaseModel):
    email: str
    name: str = ""

class DuplicateCheckRequest(BaseModel):
    recipients_raw: Optional[str] = None
    recipients: Optional[List[RecipientItem]] = None

@router.post("/campaign/check-duplicates")
def check_duplicates(payload: DuplicateCheckRequest):
    """
    Checks if any of the imported emails already exist in active or past campaigns.
    Returns details of duplicate recipients, including their last campaign and contact status.
    """
    # 1. Parse and extract all emails
    parsed_recipients = []
    if payload.recipients_raw:
        parsed_recipients.extend(parse_recipient_string(payload.recipients_raw))
    if payload.recipients:
        parsed_recipients.extend([{"email": r.email, "name": r.name} for r in payload.recipients])
        
    # Deduplicate the merged list
    deduped = deduplicate_recipients(parsed_recipients)
    
    if not deduped:
        return {"duplicates": [], "total_duplicates": 0}
        
    # Get all emails to search
    emails_to_check = [r["email"] for r in deduped]
    
    # 2. Query MongoDB for existing recipients with these emails
    existing_recipients = list(db.recipients.find({"email": {"$in": emails_to_check}}))
    
    if not existing_recipients:
        return {"duplicates": [], "total_duplicates": 0}
        
    # 3. Compile details for duplicate emails
    # Fetch campaign names to match with duplicate records
    campaign_ids = list(set([r["campaign_id"] for r in existing_recipients if "campaign_id" in r]))
    campaigns_cursor = db.campaigns.find({"_id": {"$in": campaign_ids}})
    campaign_map = {str(c["_id"]): c.get("name", "Unknown Campaign") for c in campaigns_cursor}
    
    duplicates = []
    for r in existing_recipients:
        camp_id = r.get("campaign_id")
        camp_name = campaign_map.get(str(camp_id), "Unknown Campaign")
        
        duplicates.append({
            "email": r["email"],
            "name": r.get("name", ""),
            "status": r.get("status", "unknown"),
            "campaign_id": str(camp_id),
            "campaign_name": camp_name,
            "sent_at": r.get("sent_at", None),
            "replied_at": r.get("replied_at", None)
        })
        
    return {
        "duplicates": duplicates,
        "total_duplicates": len(duplicates)
    }

class CampaignCreateRequest(BaseModel):
    name: str
    description: Optional[str] = ""
    goal: str
    recipients_raw: Optional[str] = None
    recipients: Optional[List[RecipientItem]] = None

@router.post("/campaign/new")
def create_campaign(payload: CampaignCreateRequest, profile: dict = Depends(verify_resume_uploaded)):
    """
    Creates a new email outreach campaign. Parses recipients list, saves the campaign metadata,
    and inserts recipient draft records into MongoDB.
    """
    from datetime import datetime
    
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Campaign name is required.")
        
    # 1. Parse and extract all email recipients
    parsed_recipients = []
    if payload.recipients_raw:
        parsed_recipients.extend(parse_recipient_string(payload.recipients_raw))
    if payload.recipients:
        parsed_recipients.extend([{"email": r.email, "name": r.name} for r in payload.recipients])
        
    # Deduplicate recipients
    deduped = deduplicate_recipients(parsed_recipients)
    if not deduped:
        raise HTTPException(status_code=400, detail="At least one valid recipient email is required to create a campaign.")
        
    # 2. Save campaign metadata to database
    campaign_doc = {
        "name": payload.name.strip(),
        "description": payload.description.strip() if payload.description else "",
        "goal": payload.goal.strip(),
        "status": "draft",
        "created_at": datetime.utcnow(),
        "total_recipients": len(deduped),
        "sent_count": 0,
        "reply_count": 0,
        "failed_count": 0,
        "bounce_count": 0,
        "ooo_count": 0
    }
    
    result = db.campaigns.insert_one(campaign_doc)
    campaign_id = result.inserted_id
    
    # 3. Save recipient drafts to database referencing this campaign
    recipient_docs = []
    for r in deduped:
        recipient_docs.append({
            "campaign_id": campaign_id,
            "email": r["email"],
            "name": r["name"],
            "status": "draft",
            "created_at": datetime.utcnow(),
            "sent_at": None,
            "replied_at": None,
            "error_message": None,
            "mail_subject": "",
            "mail_body": "",
            "message_id": None
        })
        
    if recipient_docs:
        db.recipients.insert_many(recipient_docs)
        
    # Prepare returned data (converting ObjectId to string)
    campaign_doc["_id"] = str(campaign_id)
    
    return {
        "message": "Campaign and recipient drafts created successfully.",
        "campaign": campaign_doc,
        "total_recipients_imported": len(deduped)
    }
