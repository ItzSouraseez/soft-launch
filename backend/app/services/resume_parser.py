import pdfplumber

def extract_text_from_pdf(pdf_path: str) -> str:
    """
    Extracts raw text content from all pages of a PDF resume.
    """
    text = ""
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                extracted = page.extract_text()
                if extracted:
                    text += extracted + "\n"
    except Exception as e:
        print(f"Error extracting text from PDF {pdf_path}: {e}")
        raise ValueError(f"Failed to read PDF file: {str(e)}")
    return text.strip()

def get_resume_parsing_prompt(raw_text: str) -> str:
    """
    Constructs the system prompt instruction for Groq to parse a resume.
    """
    return f"""You are an expert ATS (Applicant Tracking System) parser. Your task is to analyze the following raw text extracted from a resume and convert it into a structured JSON object.

Extract the following information:
1. "full_name": The candidate's full name.
2. "title": A professional summary title (e.g., "Software Engineer", "Full Stack Developer"). If not explicitly mentioned, infer a professional title based on experience.
3. "bio": A short professional biography summarizing their background (2-4 sentences).
4. "skills": A flat array of technical and professional skills mentioned.
5. "experience": An array of work experience items, each with:
   - "company": Name of the company/organization.
   - "role": Job title/role.
   - "duration": Period of employment (e.g., "June 2021 - Present", "2019 - 2020").
   - "description": Concise description of responsibilities and key achievements.
6. "education": An array of education items, each with:
   - "institution": School or university name.
   - "degree": Degree earned (e.g., "Bachelor of Science in Computer Science").
   - "year": Graduation year or period (e.g., "2023", "2018 - 2022").
7. "projects": An array of personal or professional projects mentioned, each with:
   - "title": Name of the project.
   - "description": Description of what the project does and technologies used.
   - "link": URL link to code repository or demo, if present (otherwise empty string).
8. "social_links": An object containing:
   - "linkedin": URL to LinkedIn profile, if found (otherwise empty string).
   - "github": URL to GitHub profile, if found (otherwise empty string).
   - "portfolio": URL to personal portfolio website, if found (otherwise empty string).

Ensure the output is strictly valid JSON matching the description above. Do not include any markdown comments, reasoning, or additional text outside of the JSON object.

Raw Resume Text:
{raw_text}"""
