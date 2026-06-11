from pydantic import BaseModel, Field
from typing import List

class SettingsSchema(BaseModel):
    groq_api_keys: List[str] = Field(default_factory=list, description="List of Groq API keys for key rotation")
    smtp_email: str = Field(default="", description="Email address used to send outgoing emails")
    smtp_password: str = Field(default="", description="SMTP App password for outgoing emails")
    smtp_host: str = Field(default="smtp.gmail.com", description="SMTP server hostname")
    smtp_port: int = Field(default=587, description="SMTP server port")
    imap_email: str = Field(default="", description="Email address used for IMAP inbox checking")
    imap_password: str = Field(default="", description="IMAP App password for inbox checking")
    imap_host: str = Field(default="imap.gmail.com", description="IMAP server hostname")
    imap_port: int = Field(default=993, description="IMAP server port")
    send_delay_min: int = Field(default=30, description="Minimum delay in seconds between sending emails")
    send_delay_max: int = Field(default=60, description="Maximum delay in seconds between sending emails")
