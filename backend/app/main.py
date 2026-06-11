from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.db import init_db

from app.services.inbox_monitor import start_scheduler, shutdown_scheduler

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database indexes on startup
    init_db()
    
    # Ensure local uploads directory exists
    import os
    os.makedirs("uploads", exist_ok=True)
    
    # Start the background inbox check scheduler
    try:
        start_scheduler()
    except Exception as e:
        print(f"Warning: Could not start background inbox check scheduler: {e}")
        
    yield
    
    # Shutdown the background inbox check scheduler
    try:
        shutdown_scheduler()
    except Exception as e:
        print(f"Warning: Could not shutdown background inbox check scheduler: {e}")


app = FastAPI(
    title="Cold Outreach Tool API",
    description="Backend API for Cold Email Outreach Tool with AI-generated drafts, IMAP monitoring, and CRM features",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS headers to allow connection from the Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.api.settings import router as settings_router
from app.api.profile import router as profile_router
from app.api.resume import router as resume_router
from app.api.campaigns import router as campaigns_router

app.include_router(settings_router)
app.include_router(profile_router)
app.include_router(resume_router)
app.include_router(campaigns_router)

@app.get("/")
def read_root():
    return {
        "status": "healthy",
        "service": "Cold Outreach API",
        "version": "1.0.0"
    }

@app.get("/api/health")
def health_check():
    db_status = "unhealthy"
    try:
        from app.core.db import get_db
        db = get_db()
        db.command("ping")
        db_status = "healthy"
    except Exception as e:
        db_status = f"unhealthy: {str(e)}"
    
    return {
        "status": "healthy" if db_status == "healthy" else "unhealthy",
        "database": db_status,
        "service": "Cold Outreach API",
        "version": "1.0.0"
    }
