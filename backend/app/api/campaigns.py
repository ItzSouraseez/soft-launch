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
