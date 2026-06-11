from fastapi import APIRouter
from app.core.config_manager import get_profile
from app.schemas.profile import ProfileSchema

router = APIRouter(prefix="/api/profile", tags=["profile"])

@router.get("", response_model=ProfileSchema)
def read_profile():
    """
    Retrieves the user's professional profile (bio, skills, experiences, education, etc.).
    """
    return get_profile()
