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
        
    # Program domain-level aggregation to find other leads on the identical domain
    domain = email_clean.split("@")[-1].strip()
    other_leads_cursor = db.recipients.find({
        "email": {"$regex": f"@{domain}$", "$options": "i"},
        "email": {"$ne": email_clean}
    })
    
    other_leads_map = {}
    for ol in other_leads_cursor:
        ol_email = ol["email"]
        if ol_email not in other_leads_map:
            other_leads_map[ol_email] = {
                "email": ol_email,
                "name": ol.get("name", ""),
                "status": ol.get("status", "draft"),
                "campaign_id": str(ol.get("campaign_id", ""))
            }
            
    return {
        "email": email_clean,
        "name": recipients[0].get("name", ""),
        "history": history,
        "other_domain_leads": list(other_leads_map.values())
    }

@router.get("/dashboard/reply-stats")
def get_reply_stats():
    """
    Computes aggregated CRM stats and ratios for the dashboard.
    """
    total_sent = db.recipients.count_documents({"status": {"$in": ["sent", "replied", "ooo", "bounced"]}})
    total_replied = db.recipients.count_documents({"status": "replied"})
    total_ooo = db.recipients.count_documents({"status": "ooo"})
    total_bounced = db.recipients.count_documents({"status": "bounced"})
    
    reply_rate = (total_replied / total_sent * 100) if total_sent > 0 else 0.0
    ooo_rate = (total_ooo / total_sent * 100) if total_sent > 0 else 0.0
    bounce_rate = (total_bounced / total_sent * 100) if total_sent > 0 else 0.0
    
    sentiment_positive = db.recipients.count_documents({"status": "replied", "reply_sentiment": "positive"})
    sentiment_negative = db.recipients.count_documents({"status": "replied", "reply_sentiment": "negative"})
    
    # Neutral/Unclassified sentiments count
    sentiment_neutral = db.recipients.count_documents({
        "status": "replied", 
        "reply_sentiment": {"$in": ["neutral", None, ""]}
    })
    
    total_replies_sentiment = sentiment_positive + sentiment_negative + sentiment_neutral
    
    return {
        "metrics": {
            "total_sent": total_sent,
            "total_replied": total_replied,
            "total_ooo": total_ooo,
            "total_bounced": total_bounced,
            "reply_rate": round(reply_rate, 2),
            "ooo_rate": round(ooo_rate, 2),
            "bounce_rate": round(bounce_rate, 2)
        },
        "sentiment_breakdown": {
            "positive": {
                "count": sentiment_positive,
                "percentage": round((sentiment_positive / total_replies_sentiment * 100), 2) if total_replies_sentiment > 0 else 0.0
            },
            "negative": {
                "count": sentiment_negative,
                "percentage": round((sentiment_negative / total_replies_sentiment * 100), 2) if total_replies_sentiment > 0 else 0.0
            },
            "neutral": {
                "count": sentiment_neutral,
                "percentage": round((sentiment_neutral / total_replies_sentiment * 100), 2) if total_replies_sentiment > 0 else 0.0
            }
        }
    }

@router.get("/reengagement")
def get_reengagement_candidates(days_limit: int = 3):
    """
    Retrieves candidates (recipients) who received an email more than `days_limit` days ago
    but haven't replied, bounced, or received a follow-up yet.
    """
    from datetime import timedelta
    
    time_limit = datetime.utcnow() - timedelta(days=days_limit)
    
    # 1. Query sent recipients sent before the time limit
    query = {
        "status": "sent",
        "sent_at": {"$lt": time_limit}
    }
    candidates = list(db.recipients.find(query))
    
    if not candidates:
        return []
        
    candidate_ids = [c["_id"] for c in candidates]
    
    # 2. Query followups collection to see who already has a follow-up (drafted or sent)
    # Initialize followups collection if not exists
    existing_followups = list(db.followups.find({"recipient_id": {"$in": candidate_ids}}))
    exclude_recipient_ids = set([f["recipient_id"] for f in existing_followups])
    
    # 3. Filter candidates
    reengagement_list = []
    
    campaign_ids = list(set([c["campaign_id"] for c in candidates]))
    campaigns_cursor = db.campaigns.find({"_id": {"$in": campaign_ids}})
    campaign_map = {str(camp["_id"]): camp.get("name", "Unknown Campaign") for camp in campaigns_cursor}
    
    for c in candidates:
        if c["_id"] not in exclude_recipient_ids:
            reengagement_list.append({
                "recipient_id": str(c["_id"]),
                "campaign_id": str(c["campaign_id"]),
                "campaign_name": campaign_map.get(str(c["campaign_id"]), "Unknown Campaign"),
                "email": c["email"],
                "name": c.get("name", ""),
                "sent_at": c["sent_at"].isoformat() if c.get("sent_at") else None,
                "days_since_contact": (datetime.utcnow() - c["sent_at"]).days if c.get("sent_at") else 0
            })
            
    return reengagement_list

class BlockedDomainRequest(BaseModel):
    domain: str

@router.post("/blocked-domains")
def add_blocked_domain(payload: BlockedDomainRequest):
    """
    Adds a new domain to the blocked domains exclusions list.
    """
    domain = payload.domain.strip().lower()
    if not domain:
        raise HTTPException(status_code=400, detail="Domain name cannot be empty.")
        
    # Check if already exists
    existing = db.blocked_domains.find_one({"domain": domain})
    if existing:
        raise HTTPException(status_code=400, detail="Domain is already in the blocked list.")
        
    doc = {
        "domain": domain,
        "created_at": datetime.utcnow()
    }
    db.blocked_domains.insert_one(doc)
    
    return {
        "message": f"Domain '{domain}' successfully added to blocked list.",
        "domain": domain
    }

@router.delete("/blocked-domains/{domain}")
def remove_blocked_domain(domain: str):
    """
    Removes a domain from the blocked domains exclusions list.
    """
    domain_clean = domain.strip().lower()
    
    result = db.blocked_domains.delete_one({"domain": domain_clean})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Domain not found in the blocked list.")
        
    return {
        "message": f"Domain '{domain_clean}' successfully removed from blocked list.",
        "domain": domain_clean
    }






