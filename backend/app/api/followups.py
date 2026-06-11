from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from bson import ObjectId
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
from app.core.db import get_db
from app.api.campaigns import verify_resume_uploaded

db = get_db()
router = APIRouter(prefix="/api", tags=["followups"])

class FollowupGenerateRequest(BaseModel):
    custom_instruction: Optional[str] = ""

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

@router.post("/campaign/{id}/generate-followups")
def trigger_followup_generation(
    id: str,
    payload: FollowupGenerateRequest,
    background_tasks: BackgroundTasks,
    profile: dict = Depends(verify_resume_uploaded)
):
    """
    Triggers concurrent follow-up email draft generation in the background.
    """
    from app.services.ai_generator import followup_generation_jobs, run_parallel_followup_generation
    from app.core.config_manager import get_settings
    
    try:
        campaign_oid = ObjectId(id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid campaign ID format.")
        
    campaign = db.campaigns.find_one({"_id": campaign_oid})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found.")
        
    # Check if a job is already running
    job = followup_generation_jobs.get(id)
    if job and job["status"] == "running":
        raise HTTPException(status_code=400, detail="A follow-up generation job is already running for this campaign.")
        
    settings = get_settings()
    api_keys = settings.get("groq_api_keys", [])
    if not api_keys:
        raise HTTPException(status_code=400, detail="Groq API keys are not configured in settings.")
        
    eligible = get_eligible_recipients_list(campaign_oid)
    if not eligible:
        return {
            "message": "No recipients eligible for follow-up generation found.",
            "total_triggered": 0
        }
        
    recipient_ids = [str(r["_id"]) for r in eligible]
    
    background_tasks.add_task(
        run_parallel_followup_generation,
        campaign_id_str=id,
        recipient_ids=recipient_ids,
        api_keys=api_keys,
        profile_data=profile,
        custom_instruction=payload.custom_instruction
    )
    
    return {
        "message": f"Follow-up generation started in background for {len(recipient_ids)} recipients.",
        "total_triggered": len(recipient_ids)
    }

@router.get("/campaign/{id}/followup/generate-progress")
def get_followup_generation_progress(id: str):
    """
    Returns the real-time progress metrics for the campaign's active follow-up generation job.
    Falls back to querying database status if no active job is tracked in memory.
    """
    from app.services.ai_generator import followup_generation_jobs
    
    try:
        campaign_oid = ObjectId(id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid campaign ID format.")
        
    job = followup_generation_jobs.get(id)
    if job:
        return job
        
    # Fallback: calculate status from database
    recipients = list(db.recipients.find({
        "campaign_id": campaign_oid,
        "status": {"$in": ["sent", "ooo", "replied"]}
    }))
    
    if not recipients:
        return {
            "status": "idle",
            "total": 0,
            "processed": 0,
            "success": 0,
            "failed": 0,
            "errors": []
        }
        
    rec_ids = [r["_id"] for r in recipients]
    total = len(rec_ids)
    
    generating = db.followups.count_documents({"recipient_id": {"$in": rec_ids}, "status": "generating"})
    success = db.followups.count_documents({"recipient_id": {"$in": rec_ids}, "status": "draft"})
    failed = db.followups.count_documents({"recipient_id": {"$in": rec_ids}, "status": "failed"})
    
    processed = success + failed
    is_running = generating > 0 and processed < total
    
    return {
        "status": "running" if is_running else "completed" if processed >= total and total > 0 else "idle",
        "total": total,
        "processed": processed,
        "success": success,
        "failed": failed,
        "errors": []
    }

@router.get("/campaign/{id}/followup/preview")
def preview_followups(id: str):
    """
    GET endpoint returning all follow-up drafts for a campaign.
    """
    try:
        campaign_oid = ObjectId(id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid campaign ID format.")
        
    campaign = db.campaigns.find_one({"_id": campaign_oid})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found.")
        
    followups = list(db.followups.find({"campaign_id": campaign_oid}))
    
    formatted = []
    for f in followups:
        formatted.append({
            "id": str(f["_id"]),
            "recipient_id": str(f["recipient_id"]),
            "email": f["email"],
            "name": f.get("name", ""),
            "status": f["status"],
            "mail_subject": f.get("mail_subject", ""),
            "mail_body": f.get("mail_body", ""),
            "error_message": f.get("error_message"),
            "created_at": f["created_at"].isoformat() if isinstance(f.get("created_at"), datetime) else None
        })
        
    return formatted

class FollowupUpdateRequest(BaseModel):
    mail_subject: Optional[str] = None
    mail_body: Optional[str] = None

@router.put("/followup/{fid}")
def update_followup(fid: str, payload: FollowupUpdateRequest):
    """
    PUT endpoint to update the subject and body of a follow-up draft.
    """
    try:
        followup_oid = ObjectId(fid)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid follow-up ID format.")
        
    followup = db.followups.find_one({"_id": followup_oid})
    if not followup:
        raise HTTPException(status_code=404, detail="Follow-up draft not found.")
        
    update_data = {}
    if payload.mail_subject is not None:
        update_data["mail_subject"] = payload.mail_subject.strip()
    if payload.mail_body is not None:
        update_data["mail_body"] = payload.mail_body.strip()
        
    if update_data:
        db.followups.update_one({"_id": followup_oid}, {"$set": update_data})
        
    updated = db.followups.find_one({"_id": followup_oid})
    updated["_id"] = str(updated["_id"])
    updated["campaign_id"] = str(updated["campaign_id"])
    updated["recipient_id"] = str(updated["recipient_id"])
    if "created_at" in updated and updated["created_at"]:
        updated["created_at"] = updated["created_at"].isoformat()
        
    return {
        "message": "Follow-up draft updated successfully.",
        "followup": updated
    }

@router.delete("/followup/{fid}")
def delete_followup(fid: str):
    """
    DELETE endpoint to remove a follow-up draft.
    """
    try:
        followup_oid = ObjectId(fid)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid follow-up ID format.")
        
    followup = db.followups.find_one({"_id": followup_oid})
    if not followup:
        raise HTTPException(status_code=404, detail="Follow-up draft not found.")
        
    db.followups.delete_one({"_id": followup_oid})
    
    return {
        "message": "Follow-up draft deleted successfully.",
        "followup_id": fid
    }

@router.post("/campaign/{id}/followup/send")
def trigger_followup_send(id: str, background_tasks: BackgroundTasks):
    """
    Triggers bulk follow-up sending for all drafts in the campaign.
    """
    from app.services.email_sender import followup_sending_jobs, run_followup_send, get_smtp_config
    from app.core.config_manager import get_profile
    
    try:
        campaign_oid = ObjectId(id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid campaign ID format.")
        
    campaign = db.campaigns.find_one({"_id": campaign_oid})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found.")
        
    # Check if a sending job is already running
    job = followup_sending_jobs.get(id)
    if job and job["status"] == "running":
        raise HTTPException(status_code=400, detail="A follow-up sending job is already running for this campaign.")
        
    # Verify SMTP credentials
    smtp_config = get_smtp_config()
    if not smtp_config["email"] or not smtp_config["password"]:
        raise HTTPException(status_code=400, detail="SMTP credentials are not configured in settings.")
        
    # Get profile for resume attachment path
    profile = get_profile()
    resume_path = profile.get("resume_path")
    
    # Check if there are drafts to send
    draft_count = db.followups.count_documents({
        "campaign_id": campaign_oid,
        "status": "draft"
    })
    
    if draft_count == 0:
        raise HTTPException(status_code=400, detail="No follow-up drafts found in this campaign ready to send.")
        
    # Start background send task
    background_tasks.add_task(
        run_followup_send,
        campaign_id_str=id,
        smtp_config=smtp_config,
        resume_path=resume_path
    )
    
    return {
        "message": f"Follow-up sending queue started for {draft_count} recipients.",
        "total_queued": draft_count
    }

@router.get("/campaign/{id}/followup/progress")
def get_followup_sending_progress(id: str):
    """
    Returns the real-time progress metrics for the campaign's active follow-up sending job.
    """
    from app.services.email_sender import followup_sending_jobs
    
    try:
        campaign_oid = ObjectId(id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid campaign ID format.")
        
    job = followup_sending_jobs.get(id)
    if job:
        return job
        
    # Fallback to database
    total = db.followups.count_documents({"campaign_id": campaign_oid})
    if total == 0:
        return {
            "status": "idle",
            "total": 0,
            "processed": 0,
            "sent": 0,
            "failed": 0,
            "blocked": 0,
            "errors": []
        }
        
    sent = db.followups.count_documents({"campaign_id": campaign_oid, "status": "sent"})
    failed = db.followups.count_documents({"campaign_id": campaign_oid, "status": "failed"})
    blocked = db.followups.count_documents({"campaign_id": campaign_oid, "status": "blocked"})
    generating = db.followups.count_documents({"campaign_id": campaign_oid, "status": "generating"})
    
    processed = sent + failed + blocked
    is_running = generating > 0 and processed < total
    
    return {
        "status": "running" if is_running else "completed" if processed >= total else "idle",
        "total": total,
        "processed": processed,
        "sent": sent,
        "failed": failed,
        "blocked": blocked,
        "errors": []
    }





