from fastapi import APIRouter, BackgroundTasks, HTTPException
from app.services.inbox_monitor import check_inbox_and_classify, get_imap_config
from app.core.config_manager import get_settings

router = APIRouter(prefix="/api/inbox", tags=["inbox"])

@router.post("/check")
def trigger_manual_inbox_check(background_tasks: BackgroundTasks):
    """
    Manually triggers a background IMAP inbox check and email classification scan.
    """
    # Verify IMAP configuration is present
    imap_config = get_imap_config()
    if not imap_config.get("email") or not imap_config.get("password"):
        raise HTTPException(
            status_code=400,
            detail="IMAP configuration is incomplete. Please configure your IMAP email and App Password."
        )
        
    # Verify Groq API key is present
    settings = get_settings()
    api_keys = settings.get("groq_api_keys", [])
    if not api_keys:
        raise HTTPException(
            status_code=400,
            detail="Groq API keys are not configured. Please configure them in settings first."
        )
        
    # Trigger background task
    background_tasks.add_task(check_inbox_and_classify)
    
    return {
        "status": "success",
        "message": "Inbox scan started in the background."
    }
