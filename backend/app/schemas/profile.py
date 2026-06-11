from pydantic import BaseModel, Field
from typing import List

class SocialLinksSchema(BaseModel):
    linkedin: str = Field(default="", description="LinkedIn URL")
    github: str = Field(default="", description="GitHub URL")
    portfolio: str = Field(default="", description="Portfolio or Personal Website URL")

class ExperienceSchema(BaseModel):
    company: str = Field(default="", description="Company name")
    role: str = Field(default="", description="Role or Title")
    duration: str = Field(default="", description="Time period, e.g., 'Jan 2023 - Present'")
    description: str = Field(default="", description="Description of responsibilities and achievements")

class EducationSchema(BaseModel):
    institution: str = Field(default="", description="School or University name")
    degree: str = Field(default="", description="Degree obtained, e.g., 'B.S. in Computer Science'")
    year: str = Field(default="", description="Graduation year or time period")

class ProjectSchema(BaseModel):
    title: str = Field(default="", description="Project title")
    description: str = Field(default="", description="Short project description")
    link: str = Field(default="", description="Link to source code or live demo")

class ProfileSchema(BaseModel):
    full_name: str = Field(default="", description="User's full name")
    title: str = Field(default="", description="Professional title, e.g., 'Software Engineer'")
    bio: str = Field(default="", description="Short professional bio")
    skills: List[str] = Field(default_factory=list, description="List of technical and soft skills")
    experience: List[ExperienceSchema] = Field(default_factory=list, description="List of work experience items")
    education: List[EducationSchema] = Field(default_factory=list, description="List of education items")
    projects: List[ProjectSchema] = Field(default_factory=list, description="List of personal or professional projects")
    social_links: SocialLinksSchema = Field(default_factory=SocialLinksSchema, description="Links to social profiles")
    resume_parsed: bool = Field(default=False, description="Flag indicating if a resume has been successfully parsed")
    resume_path: str = Field(default="", description="Local path to the uploaded PDF resume")
    raw_resume_text: str = Field(default="", description="Raw text extracted from the PDF resume")
