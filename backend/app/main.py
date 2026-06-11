from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Cold Outreach Tool API",
    description="Backend API for Cold Email Outreach Tool with AI-generated drafts, IMAP monitoring, and CRM features",
    version="1.0.0"
)

# Configure CORS headers to allow connection from the Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {
        "status": "healthy",
        "service": "Cold Outreach API",
        "version": "1.0.0"
    }
