import re

# Standard regex pattern for matching email addresses
EMAIL_REGEX = re.compile(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}')

def parse_recipient_string(raw_text: str) -> list[dict]:
    """
    Parses a raw input string containing list of email recipients in various formats:
    - Newline-separated lists (one email or Name/Email pair per line)
    - Comma, semicolon, or tab-separated plain email lists
    - Bracket formats: "Recruiter Name <recruiter@company.com>" or "Recruiter Name [recruiter@company.com]"
    - Dash formats: "Recruiter Name - recruiter@company.com"
    
    Returns a list of dictionaries: [{"email": "recruiter@company.com", "name": "Recruiter Name"}]
    """
    recipients = []
    if not raw_text:
        return recipients
        
    lines = raw_text.splitlines()
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
            
        # Case 1: Plain comma/semicolon separated emails on a single line (no brackets present)
        if ',' in line or ';' in line:
            if '<' not in line and '[' not in line:
                tokens = re.split(r'[,;\t]', line)
                for token in tokens:
                    token = token.strip()
                    if not token:
                        continue
                    email_match = EMAIL_REGEX.search(token)
                    if email_match:
                        email = email_match.group(0).lower()
                        recipients.append({"email": email, "name": ""})
                continue
                
        # Case 2: Bracket format: Name <email> or Name [email]
        bracket_match = re.search(r'([^<>[\]]+)?\s*[<\[]([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})[>\]]', line)
        if bracket_match:
            name_part = bracket_match.group(1)
            email_part = bracket_match.group(2)
            
            name = name_part.strip().strip('"\'') if name_part else ""
            email = email_part.strip().lower()
            recipients.append({"email": email, "name": name})
            continue
            
        # Case 3: Dash format: Name - email
        dash_match = re.search(r'([^-]+)-\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})', line)
        if dash_match:
            name_part = dash_match.group(1)
            email_part = dash_match.group(2)
            
            name = name_part.strip().strip('"\'')
            email = email_part.strip().lower()
            recipients.append({"email": email, "name": name})
            continue
            
        # Case 4: Fallback - Extract the first email match and clean up any remaining text as the name
        email_match = EMAIL_REGEX.search(line)
        if email_match:
            email = email_match.group(0).lower()
            name_part = line.replace(email_match.group(0), "").strip()
            # Clean up residual separators and punctuation around the name
            name_part = re.sub(r'[\s–—,;:<>()[\]"\'\\-]+$', '', name_part)
            name_part = re.sub(r'^[\s–—,;:<>()[\]"\'\\-]+', '', name_part)
            name = name_part.strip()
            recipients.append({"email": email, "name": name})
            
    return recipients

def deduplicate_recipients(recipients: list[dict]) -> list[dict]:
    """
    Deduplicates a list of recipients by email address (case-insensitive),
    preserving the first occurrence and maintaining the original order.
    """
    seen = set()
    unique_recipients = []
    for r in recipients:
        email = r.get("email", "").strip().lower()
        if not email:
            continue
        if email not in seen:
            seen.add(email)
            unique_recipients.append({
                "email": email,
                "name": r.get("name", "").strip()
            })
    return unique_recipients
