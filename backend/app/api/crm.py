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

