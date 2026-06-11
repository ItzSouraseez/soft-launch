from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from bson import ObjectId
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
from app.core.db import get_db

db = get_db()
router = APIRouter(prefix="/api", tags=["followups"])

def get_eligible_recipients_list(campaign_oid: ObjectId) -> List[dict]:
    """
    Helper to query database for recipients eligible for a follow-up.
    Excludes those who already have a followup record.
    """
    recipients = list(db.recipients.find({
        "campaign_id": campaign_oid,
        "status": {"$in": ["sent", "ooo", "replied"]}
    }))
    
    if not recipients:
        return []
        
    rec_ids = [r["_id"] for r in recipients]
    existing_followups = list(db.followups.find({"recipient_id": {"$in": rec_ids}}))
    exclude_ids = set([f["recipient_id"] for f in existing_followups])
    
    return [r for r in recipients if r["_id"] not in exclude_ids]

@router.get("/campaign/{id}/followup/eligible")
def get_eligible_followup_recipients(id: str):
    """
    GET endpoint listing all recipients under a campaign eligible for follow-ups.
    """
    try:
        campaign_oid = ObjectId(id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid campaign ID format.")
        
    campaign = db.campaigns.find_one({"_id": campaign_oid})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found.")
        
    eligible = get_eligible_recipients_list(campaign_oid)
    
    formatted = []
    for r in eligible:
        formatted.append({
            "id": str(r["_id"]),
            "email": r["email"],
            "name": r.get("name", ""),
            "status": r.get("status", "draft"),
            "sent_at": r.get("sent_at").isoformat() if r.get("sent_at") else None,
            "replied_at": r.get("replied_at").isoformat() if r.get("replied_at") else None,
            "reply_sentiment": r.get("reply_sentiment"),
            "ooo_return_date": r.get("ooo_return_date")
        })
        
    return formatted

