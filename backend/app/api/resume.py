from fastapi import APIRouter, File, UploadFile, HTTPException
import shutil
import os
from app.services.resume_parser import extract_text_from_pdf, parse_resume_with_groq
from app.core.config_manager import get_settings, get_profile, save_profile

router = APIRouter(prefix="/api", tags=["resume"])

@router.post("/upload-resume")
async def upload_resume(file: UploadFile = File(...)):
    """
    Uploads a PDF resume file, saves it locally, extracts its text, and auto-parses it with Groq if keys are configured.
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed.")
    
    # Ensure uploads folder exists
    os.makedirs("uploads", exist_ok=True)
    
    # Define local path where resume is stored
    file_path = os.path.join("uploads", "resume.pdf")
    
    try:
        # Save file to disk
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save resume to disk: {str(e)}")
        
    # Extract text from the saved PDF
    try:
        raw_text = extract_text_from_pdf(file_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to extract text from PDF: {str(e)}")
        
    # Check if Groq API keys are configured
    settings = get_settings()
    has_groq_keys = bool(settings.get("groq_api_keys"))
    
    profile = get_profile()
    parsed_successfully = False
    
    if has_groq_keys:
        try:
            parsed_data = parse_resume_with_groq(raw_text)
            
            # Map parsed data to user profile
            profile.update({
                "full_name": parsed_data.get("full_name", profile.get("full_name", "")),
                "title": parsed_data.get("title", profile.get("title", "")),
                "bio": parsed_data.get("bio", profile.get("bio", "")),
                "skills": parsed_data.get("skills", profile.get("skills", [])),
                "experience": parsed_data.get("experience", profile.get("experience", [])),
                "education": parsed_data.get("education", profile.get("education", [])),
                "projects": parsed_data.get("projects", profile.get("projects", [])),
                "social_links": parsed_data.get("social_links", profile.get("social_links", {})),
                "resume_parsed": True,
                "resume_path": file_path,
                "raw_resume_text": raw_text
            })
            save_profile(profile)
            parsed_successfully = True
        except Exception as e:
            # Log error but don't fail the upload completely, fall back to unparsed profile state
            print(f"Auto-parsing failed: {e}")
            
    if not parsed_successfully:
        # Update profile with just the paths and text, keep resume_parsed as False
        profile.update({
            "resume_parsed": False,
            "resume_path": file_path,
            "raw_resume_text": raw_text
        })
        save_profile(profile)
        
    if has_groq_keys and parsed_successfully:
        return {
            "message": "Resume uploaded and parsed successfully.",
            "filename": file.filename,
            "path": file_path,
            "parsed": True,
            "profile": profile
        }
    elif has_groq_keys and not parsed_successfully:
        return {
            "message": "Resume uploaded successfully, but auto-parsing failed. You can re-parse it once Groq service is active.",
            "filename": file.filename,
            "path": file_path,
            "parsed": False,
            "profile": profile
        }
    else:
        return {
            "message": "Resume uploaded successfully. Auto-parsing skipped because Groq API keys are not configured.",
            "filename": file.filename,
            "path": file_path,
            "parsed": False,
            "profile": profile
        }

@router.post("/resume/reparse")
async def reparse_resume():
    """
    Manually triggers re-parsing of the already uploaded PDF resume file.
    """
    file_path = os.path.join("uploads", "resume.pdf")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="No resume found on disk. Please upload one first.")
        
    # Extract text from existing file
    try:
        raw_text = extract_text_from_pdf(file_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read resume file: {str(e)}")
        
    # Check if Groq API keys are configured
    settings = get_settings()
    has_groq_keys = bool(settings.get("groq_api_keys"))
    if not has_groq_keys:
        raise HTTPException(status_code=400, detail="Groq API keys are not configured in settings. Please set them up first.")
        
    try:
        parsed_data = parse_resume_with_groq(raw_text)
        
        # Load profile and update fields
        profile = get_profile()
        profile.update({
            "full_name": parsed_data.get("full_name", profile.get("full_name", "")),
            "title": parsed_data.get("title", profile.get("title", "")),
            "bio": parsed_data.get("bio", profile.get("bio", "")),
            "skills": parsed_data.get("skills", profile.get("skills", [])),
            "experience": parsed_data.get("experience", profile.get("experience", [])),
            "education": parsed_data.get("education", profile.get("education", [])),
            "projects": parsed_data.get("projects", profile.get("projects", [])),
            "social_links": parsed_data.get("social_links", profile.get("social_links", {})),
            "resume_parsed": True,
            "resume_path": file_path,
            "raw_resume_text": raw_text
        })
        save_profile(profile)
        
        return {
            "message": "Resume successfully re-parsed.",
            "profile": profile
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Groq parsing failed: {str(e)}")
