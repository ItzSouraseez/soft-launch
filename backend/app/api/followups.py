from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from bson import ObjectId
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
from app.core.db import get_db

db = get_db()
router = APIRouter(prefix="/api", tags=["followups"])
