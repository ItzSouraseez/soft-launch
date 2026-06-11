from fastapi import APIRouter, HTTPException, Depends
from bson import ObjectId
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
from app.core.db import get_db

db = get_db()
router = APIRouter(prefix="/api", tags=["crm"])

@router.get("/search")
def search_contacts(
    q: Optional[str] = None,
    campaign_id: Optional[str] = None,
    status: Optional[str] = None,
    page: int = 1,
    limit: int = 20
):
    """
    Search and filter recipients in the CRM with pagination.
    Supports filtering by campaign ID, status, name, or email.
    """
    query = {}
    
    if q:
        query["$or"] = [
            {"email": {"$regex": q, "$options": "i"}},
            {"name": {"$regex": q, "$options": "i"}}
        ]
        
    if campaign_id:
        try:
            query["campaign_id"] = ObjectId(campaign_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid campaign ID format.")
            
    if status:
        query["status"] = status
        
    skip = (page - 1) * limit
    total = db.recipients.count_documents(query)
    recipients = list(db.recipients.find(query).sort("created_at", -1).skip(skip).limit(limit))
    
    campaign_ids = list(set([r["campaign_id"] for r in recipients if "campaign_id" in r]))
    campaigns_cursor = db.campaigns.find({"_id": {"$in": campaign_ids}})
    campaign_map = {str(c["_id"]): c.get("name", "Unknown Campaign") for c in campaigns_cursor}
    
    formatted_recipients = []
    for r in recipients:
        r_id = str(r["_id"])
        c_id = str(r.get("campaign_id", ""))
        
        formatted_recipients.append({
            "id": r_id,
            "campaign_id": c_id,
            "campaign_name": campaign_map.get(c_id, "Unknown Campaign"),
            "email": r["email"],
            "name": r.get("name", ""),
            "status": r.get("status", "draft"),
            "sent_at": r.get("sent_at").isoformat() if r.get("sent_at") else None,
            "replied_at": r.get("replied_at").isoformat() if r.get("replied_at") else None,
            "reply_sentiment": r.get("reply_sentiment", None),
            "ooo_return_date": r.get("ooo_return_date", None),
            "error_message": r.get("error_message", None)
        })
        
    return {
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit if total > 0 else 0,
        "results": formatted_recipients
    }

@router.get("/contact/{email}")
def get_contact_history(email: str):
    """
    Fetches the full historical activity of a contact by their email address.
    Matches across all campaigns.
    """
    email_clean = email.strip().lower()
    
    recipients = list(db.recipients.find({"email": email_clean}).sort("created_at", -1))
    
    if not recipients:
        raise HTTPException(status_code=404, detail="Contact not found.")
        
    campaign_ids = [r["campaign_id"] for r in recipients if "campaign_id" in r]
    campaigns_cursor = db.campaigns.find({"_id": {"$in": campaign_ids}})
    campaign_map = {str(c["_id"]): c for c in campaigns_cursor}
    
    history = []
    for r in recipients:
        c_id = str(r.get("campaign_id", ""))
        campaign_info = campaign_map.get(c_id, {})
        
        events = []
        if r.get("created_at"):
            events.append({
                "event": "created",
                "timestamp": r["created_at"].isoformat(),
                "description": "Recipient draft created in campaign."
            })
        if r.get("sent_at"):
            events.append({
                "event": "sent",
                "timestamp": r["sent_at"].isoformat(),
                "description": f"Email successfully dispatched (Message-ID: {r.get('message_id', 'N/A')})."
            })
        if r.get("replied_at"):
            sentiment_str = f" (Sentiment: {r.get('reply_sentiment')})" if r.get("reply_sentiment") else ""
            ooo_str = f" (Return Date: {r.get('ooo_return_date')})" if r.get("ooo_return_date") else ""
            desc = f"Reply detected{sentiment_str}{ooo_str}."
            events.append({
                "event": r.get("status", "replied"),
                "timestamp": r["replied_at"].isoformat(),
                "description": desc
            })
        elif r.get("status") == "bounced":
            events.append({
                "event": "bounced",
                "timestamp": r.get("sent_at", r.get("created_at")).isoformat(),
                "description": f"Email delivery failed: {r.get('error_message', 'No details available')}"
            })
        elif r.get("status") == "blocked":
            events.append({
                "event": "blocked",
                "timestamp": r.get("created_at").isoformat(),
                "description": f"Dispatch blocked: {r.get('error_message', 'Domain blocked')}"
            })
            
        events.sort(key=lambda x: x["timestamp"])
            
        history.append({
            "recipient_id": str(r["_id"]),
            "campaign_id": c_id,
            "campaign_name": campaign_info.get("name", "Unknown Campaign"),
            "campaign_goal": campaign_info.get("goal", ""),
            "status": r.get("status", "draft"),
            "mail_subject": r.get("mail_subject", ""),
            "mail_body": r.get("mail_body", ""),
            "events": events
        })
        
    return {
        "email": email_clean,
        "name": recipients[0].get("name", ""),
        "history": history
    }


