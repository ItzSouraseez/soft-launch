import os
from bson import ObjectId
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
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

@router.get("/campaigns")
def list_campaigns():
    """
    Lists all outreach campaigns from the database, sorted by newest first.
    """
    campaigns = list(db.campaigns.find().sort("created_at", -1))
    for c in campaigns:
        c["_id"] = str(c["_id"])
        if "created_at" in c and c["created_at"]:
            c["created_at"] = c["created_at"].isoformat()
    return campaigns

@router.get("/campaign/{id}")
def get_campaign(id: str):
    """
    Fetches details of a specific campaign by ID, including its recipient records.
    """
    try:
        campaign_oid = ObjectId(id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid campaign ID format.")
        
    campaign = db.campaigns.find_one({"_id": campaign_oid})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found.")
        
    campaign["_id"] = str(campaign["_id"])
    if "created_at" in campaign and campaign["created_at"]:
        campaign["created_at"] = campaign["created_at"].isoformat()
        
    # Find all recipients for this campaign
    recipients = list(db.recipients.find({"campaign_id": campaign_oid}))
    for r in recipients:
        r["_id"] = str(r["_id"])
        r["campaign_id"] = str(r["campaign_id"])
        if "created_at" in r and r["created_at"]:
            r["created_at"] = r["created_at"].isoformat()
        if "sent_at" in r and r["sent_at"]:
            r["sent_at"] = r["sent_at"].isoformat()
        if "replied_at" in r and r["replied_at"]:
            r["replied_at"] = r["replied_at"].isoformat()
            
    return {
        "campaign": campaign,
        "recipients": recipients
    }

@router.delete("/campaign/{id}")
def delete_campaign(id: str):
    """
    Deletes a specific campaign and all associated recipient draft records.
    """
    try:
        campaign_oid = ObjectId(id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid campaign ID format.")
        
    campaign = db.campaigns.find_one({"_id": campaign_oid})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found.")
        
    # Delete campaign
    db.campaigns.delete_one({"_id": campaign_oid})
    
    # Delete recipients associated with the campaign
    rec_result = db.recipients.delete_many({"campaign_id": campaign_oid})
    
    # Delete followups (if any exist)
    db.followups.delete_many({"campaign_id": campaign_oid})
    
    return {
        "message": "Campaign and associated records deleted successfully.",
        "campaign_id": id,
        "total_recipients_deleted": rec_result.deleted_count
    }

@router.post("/campaign/{id}/generate")
def trigger_email_generation(id: str, background_tasks: BackgroundTasks, profile: dict = Depends(verify_resume_uploaded)):
    """
    Triggers concurrent email draft generation for all recipients in the campaign
    who are currently in 'draft', 'failed', or 'generating' status.
    """
    from app.services.ai_generator import generation_jobs, run_parallel_generation
    from app.core.config_manager import get_settings
    
    try:
        campaign_oid = ObjectId(id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid campaign ID format.")
        
    campaign = db.campaigns.find_one({"_id": campaign_oid})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found.")
        
    # Check if a job is already running for this campaign
    job = generation_jobs.get(id)
    if job and job["status"] == "running":
        raise HTTPException(status_code=400, detail="A generation job is already running for this campaign.")
        
    # Get Groq API keys
    settings = get_settings()
    api_keys = settings.get("groq_api_keys", [])
    if not api_keys:
        raise HTTPException(status_code=400, detail="Groq API keys are not configured in settings. Please configure them first.")
        
    # Get target recipients
    recipients = list(db.recipients.find({
        "campaign_id": campaign_oid,
        "status": {"$in": ["draft", "failed", "generating"]}
    }))
    
    if not recipients:
        return {
            "message": "No recipients in draft/failed status found to generate drafts for.",
            "total_triggered": 0
        }
        
    recipient_ids = [str(r["_id"]) for r in recipients]
    
    # Start the parallel task in the background
    background_tasks.add_task(
        run_parallel_generation,
        campaign_id_str=id,
        recipient_ids=recipient_ids,
        api_keys=api_keys,
        profile_data=profile,
        campaign_data=campaign
    )
    
    return {
        "message": f"Email generation started in background for {len(recipient_ids)} recipients.",
        "total_triggered": len(recipient_ids)
    }

@router.get("/campaign/{id}/generate-progress")
def get_generation_progress(id: str):
    """
    Returns the real-time progress metrics for the campaign's active draft generation job.
    Falls back to querying database status if no active job is tracked in memory.
    """
    from app.services.ai_generator import generation_jobs
    
    try:
        campaign_oid = ObjectId(id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid campaign ID format.")
        
    # Check if in-memory job status exists
    job = generation_jobs.get(id)
    if job:
        return job
        
    # Fallback: calculate counts directly from database
    total = db.recipients.count_documents({"campaign_id": campaign_oid})
    if total == 0:
        return {
            "status": "idle",
            "total": 0,
            "processed": 0,
            "success": 0,
            "failed": 0,
            "blocked": 0,
            "errors": []
        }
        
    generating = db.recipients.count_documents({"campaign_id": campaign_oid, "status": "generating"})
    success = db.recipients.count_documents({"campaign_id": campaign_oid, "status": "draft", "mail_body": {"$ne": ""}})
    failed = db.recipients.count_documents({"campaign_id": campaign_oid, "status": "failed"})
    blocked = db.recipients.count_documents({"campaign_id": campaign_oid, "status": "blocked"})
    
    processed = success + failed + blocked
    is_running = generating > 0 and processed < total
    
    return {
        "status": "running" if is_running else "completed" if processed >= total else "idle",
        "total": total,
        "processed": processed,
        "success": success,
        "failed": failed,
        "blocked": blocked,
        "errors": []
    }

@router.post("/campaign/{id}/recipient/{rid}/regenerate")
def regenerate_recipient_draft(id: str, rid: str, profile: dict = Depends(verify_resume_uploaded)):
    """
    Manually regenerates the personalized email draft for a single recipient.
    """
    from app.services.ai_generator import generate_draft_for_recipient
    from app.core.config_manager import get_settings
    
    try:
        campaign_oid = ObjectId(id)
        recipient_oid = ObjectId(rid)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid campaign or recipient ID format.")
        
    campaign = db.campaigns.find_one({"_id": campaign_oid})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found.")
        
    recipient = db.recipients.find_one({"_id": recipient_oid, "campaign_id": campaign_oid})
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found under this campaign.")
        
    # Get Groq API keys
    settings = get_settings()
    api_keys = settings.get("groq_api_keys", [])
    if not api_keys:
        raise HTTPException(status_code=400, detail="Groq API keys are not configured in settings. Please configure them first.")
        
    # Execute generation synchronously for single target
    key = api_keys[0]  # Just use the first key
    res = generate_draft_for_recipient(db, rid, key, profile, campaign)
    
    if res.get("status") == "failed":
        raise HTTPException(status_code=500, detail=f"Email regeneration failed: {res.get('error')}")
    elif res.get("status") == "blocked":
        raise HTTPException(status_code=400, detail="Email regeneration skipped because the recipient's domain is blocked.")
        
    # Fetch and return the updated recipient
    updated_rec = db.recipients.find_one({"_id": recipient_oid})
    updated_rec["_id"] = str(updated_rec["_id"])
    updated_rec["campaign_id"] = str(updated_rec["campaign_id"])
    if "created_at" in updated_rec and updated_rec["created_at"]:
        updated_rec["created_at"] = updated_rec["created_at"].isoformat()
        
    return {
        "message": "Email draft regenerated successfully.",
        "recipient": updated_rec
    }

@router.post("/campaign/{id}/send")
def trigger_campaign_send(id: str, background_tasks: BackgroundTasks):
    """
    Triggers bulk email sending for all recipients in the campaign whose status is 'draft'.
    """
    from app.services.email_sender import sending_jobs, run_bulk_send, get_smtp_config
    
    try:
        campaign_oid = ObjectId(id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid campaign ID format.")
        
    campaign = db.campaigns.find_one({"_id": campaign_oid})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found.")
        
    # Check if a sending job is already running
    job = sending_jobs.get(id)
    if job and job["status"] == "running":
        raise HTTPException(status_code=400, detail="A sending job is already running for this campaign.")
        
    # Verify SMTP credentials are set
    smtp_config = get_smtp_config()
    if not smtp_config["email"] or not smtp_config["password"]:
        raise HTTPException(status_code=400, detail="SMTP credentials are not configured in settings.")
        
    # Get profile for resume attachment path
    profile = get_profile()
    resume_path = profile.get("resume_path")
    
    # Check if there are draft recipients to send to
    draft_count = db.recipients.count_documents({
        "campaign_id": campaign_oid,
        "status": "draft"
    })
    
    if draft_count == 0:
        raise HTTPException(status_code=400, detail="No email drafts found in this campaign ready to send.")
        
    # Start bulk sending in background
    background_tasks.add_task(
        run_bulk_send,
        campaign_id_str=id,
        smtp_config=smtp_config,
        resume_path=resume_path
    )
    
    return {
        "message": f"Email sending queue started for {draft_count} recipients.",
        "total_queued": draft_count
    }

