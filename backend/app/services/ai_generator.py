import json
import threading
from typing import List
from bson import ObjectId
from groq import Groq

class ThreadSafeKeyCycler:
    """
    A thread-safe utility to rotate through a list of Groq API keys
    in a round-robin fashion for parallel draft generation.
    """
    def __init__(self, keys: List[str]):
        self.keys = keys
        self.index = 0
        self.lock = threading.Lock()
        
    def get_next_key(self) -> str:
        if not self.keys:
            raise ValueError("No Groq API keys configured in settings.")
        with self.lock:
            key = self.keys[self.index]
            self.index = (self.index + 1) % len(self.keys)
            return key

def build_cold_email_prompt(recipient_name: str, company_description: str, campaign_goal: str, profile: dict) -> str:
    """
    Constructs a highly personalized prompt instructing the LLM to draft a cold outreach email.
    Enforces rules: under 150 words, no cover letter cliches, project-fit alignment.
    """
    full_name = profile.get("full_name", "the candidate")
    title = profile.get("title", "Software Professional")
    bio = profile.get("bio", "")
    skills = ", ".join(profile.get("skills", []))
    
    # Format experience items
    exp_list = []
    for exp in profile.get("experience", []):
        exp_list.append(f"- Role: {exp.get('role')} at {exp.get('company')} ({exp.get('duration')}): {exp.get('description')}")
    experience_str = "\n".join(exp_list)
    
    # Format project items
    proj_list = []
    for proj in profile.get("projects", []):
        proj_list.append(f"- Project: {proj.get('title')}: {proj.get('description')}")
    projects_str = "\n".join(proj_list)
    
    return f"""You are a world-class cold email copywriter. Your goal is to write a highly personalized, high-conversion cold email outreach message on behalf of {full_name} ({title}).

Recipient Details:
- Name: {recipient_name if recipient_name else "Recruiter / Hiring Manager"}
- Target Company Description/Domain: {company_description}
- Campaign Goal: {campaign_goal}

Sender Profile Context:
- Full Name: {full_name}
- Professional Title: {title}
- Summary Bio: {bio}
- Key Skills: {skills}

Sender Experience:
{experience_str}

Sender Personal Projects:
{projects_str}

Outreach & Styling Guidelines (CRITICAL RULES):
1. LENGTH: The email must be extremely concise, brief, and punchy. Maximum 150 words.
2. NO CLICHES: Do NOT use generic cover-letter openings or pleasantries. Specifically, do NOT say "Hope this email finds you well", "I am writing to express my interest", "I am writing to you because", "Dear Sir/Madam", or "My name is...".
3. DIRECT OPENING: Start directly and naturally. E.g., open with a question about their engineering stack, a specific challenge they face based on their company description, or a quick observation.
4. PROJECT-FIT ROUTING: Analyze the company description. Identify which experience or project in the sender's profile is the best technical fit. Explicitly mention and highlight that one project or experience, explaining briefly how it relates to what their team is building.
5. CALL TO ACTION (CTA): Make the call to action low-friction, conversational, and direct (e.g., asking if they have 5 minutes next week or if they'd be open to seeing a quick demo).
6. TONE: Warm, professional, conversational, confident, and direct. No fluff.

Output Format:
You must return your output strictly in JSON format with two fields:
- "subject": A brief, catchy, and personalized subject line.
- "body": The text body of the email. Do not include markdown formatting or signature templates like '[Your Name]' inside the JSON body; draft it as a complete ready-to-send email.

Strictly return ONLY the JSON object. Do not include reasoning or write any preamble/postamble.
"""

def generate_draft_for_recipient(db, recipient_id: str, api_key: str, profile_data: dict, campaign_data: dict) -> dict:
    """
    Core generation worker. Fetches a recipient, builds a customized prompt, calls Groq API in JSON mode,
    validates the output, and updates the recipient's status and draft content in MongoDB.
    """
    recipient_oid = ObjectId(recipient_id)
    recipient = db.recipients.find_one({"_id": recipient_oid})
    if not recipient:
        raise ValueError(f"Recipient with ID {recipient_id} not found.")
        
    email = recipient.get("email", "").strip().lower()
    domain = email.split("@")[-1] if "@" in email else ""
    
    # 1. Blocked Domain Security Check
    is_blocked = db.blocked_domains.find_one({"domain": domain})
    if is_blocked:
        update_data = {
            "status": "blocked",
            "error_message": f"Email domain '{domain}' is in the blocked domains list."
        }
        db.recipients.update_one({"_id": recipient_oid}, {"$set": update_data})
        return {"recipient_id": recipient_id, "status": "blocked"}
        
    recipient_name = recipient.get("name", "")
    # Use campaign goal and description as company context if company-specific details aren't provided on a recipient level
    company_description = recipient.get("company_description", "")
    if not company_description:
        company_description = campaign_data.get("description", "")
        
    campaign_goal = campaign_data.get("goal", "")
    
    # 2. Build personalized prompt
    prompt = build_cold_email_prompt(
        recipient_name=recipient_name,
        company_description=company_description,
        campaign_goal=campaign_goal,
        profile=profile_data
    )
    
    # 3. Call Groq Completion API
    client = Groq(api_key=api_key)
    try:
        # Update status to generating
        db.recipients.update_one({"_id": recipient_oid}, {"$set": {"status": "generating"}})
        
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            response_format={"type": "json_object"},
            temperature=0.7,  # Slight creativity for natural copywriting
        )
        
        content = response.choices[0].message.content
        parsed = json.loads(content)
        
        subject = parsed.get("subject", "").strip()
        body = parsed.get("body", "").strip()
        
        if not subject or not body:
            raise ValueError("Groq returned empty subject or body in JSON response.")
            
        # 4. Save generated draft and update status to draft
        update_data = {
            "status": "draft",
            "mail_subject": subject,
            "mail_body": body,
            "error_message": None
        }
        db.recipients.update_one({"_id": recipient_oid}, {"$set": update_data})
        return {"recipient_id": recipient_id, "status": "success"}
        
    except Exception as e:
        error_msg = f"Generation failed: {str(e)}"
        print(f"Error generating email for {email}: {error_msg}")
        
        db.recipients.update_one(
            {"_id": recipient_oid},
            {"$set": {
                "status": "failed",
                "error_message": error_msg
            }}
        )
        return {"recipient_id": recipient_id, "status": "failed", "error": error_msg}

# In-memory tracking dictionary for active background generation jobs:
# { campaign_id_str: { "status": "running"|"completed"|"failed", "total": int, "processed": int, ... } }
generation_jobs = {}
generation_jobs_lock = threading.Lock()

def run_parallel_generation(campaign_id_str: str, recipient_ids: List[str], api_keys: List[str], profile_data: dict, campaign_data: dict):
    """
    Executes email generation for all specified recipients concurrently in a thread pool,
    rotating through Groq API keys and tracking progress in a thread-safe dict.
    """
    import concurrent.futures
    from app.core.db import get_db
    
    db = get_db()
    key_cycler = ThreadSafeKeyCycler(api_keys)
    total = len(recipient_ids)
    
    with generation_jobs_lock:
        generation_jobs[campaign_id_str] = {
            "status": "running",
            "total": total,
            "processed": 0,
            "success": 0,
            "failed": 0,
            "blocked": 0,
            "errors": []
        }
        
    def worker(rid: str):
        try:
            key = key_cycler.get_next_key()
            res = generate_draft_for_recipient(db, rid, key, profile_data, campaign_data)
            status = res.get("status")
            
            with generation_jobs_lock:
                job = generation_jobs[campaign_id_str]
                job["processed"] += 1
                if status == "success":
                    job["success"] += 1
                elif status == "blocked":
                    job["blocked"] += 1
                else:
                    job["failed"] += 1
                    if "error" in res:
                        job["errors"].append(res["error"])
        except Exception as e:
            with generation_jobs_lock:
                job = generation_jobs[campaign_id_str]
                job["processed"] += 1
                job["failed"] += 1
                job["errors"].append(f"Unexpected worker error for {rid}: {str(e)}")
                
    # Use ThreadPoolExecutor to generate concurrently
    max_workers = min(10, len(api_keys) * 3 if api_keys else 5)
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submit all tasks
        executor.map(worker, recipient_ids)
        
    # Mark job as completed
    with generation_jobs_lock:
        generation_jobs[campaign_id_str]["status"] = "completed"
