from fastapi import APIRouter
from app.core.config_manager import get_profile, save_profile
from app.schemas.profile import ProfileSchema

router = APIRouter(prefix="/api/profile", tags=["profile"])

@router.get("", response_model=ProfileSchema)
def read_profile():
    """
    Retrieves the user's professional profile (bio, skills, experiences, education, etc.).
    """
    return get_profile()

@router.post("", response_model=ProfileSchema)
def update_profile(payload: ProfileSchema):
    """
    Updates the user's professional profile in MongoDB.
    """
    saved = save_profile(payload.model_dump())
    return saved
