from fastapi import APIRouter, File, UploadFile, HTTPException
import shutil
import os

router = APIRouter(prefix="/api", tags=["resume"])

@router.post("/upload-resume")
async def upload_resume(file: UploadFile = File(...)):
    """
    Uploads a PDF resume file and saves it locally in the uploads folder.
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
        
    return {
        "message": "Resume uploaded successfully.",
        "filename": file.filename,
        "path": file_path
    }
