# OutreachAI - Personal Cold Email Outreach Platform

OutreachAI is a premium, AI-powered cold email outreach tool designed to help developers and job seekers personalise their networking campaigns. It combines a Next.js 19 frontend with a FastAPI backend and a local MongoDB instance. 

---

## ⚡ Features
- **Smart Campaign Creator**: Import recipient lists and auto-check duplicates across prior runs.
- **Resume Parser**: PDF extractor powered by pdfplumber and Groq LLMs in structured JSON mode.
- **Bulk Email Dispatcher**: Multi-recipient sender loops with random delays and domain exclusion validations.
- **IMAP Inbox Monitor**: Scans your email inbox to auto-detect recruiter responses (replies, OOOs, bounces) with Groq classification.
- **CRM Search & Drawer**: Chronological interaction timelines, manual status overrides, and parallel target detection.
- **Threaded Follow-ups**: Automated reply thread chains matching SMTP Message-ID configurations.

---

## 🛠️ Prerequisites
- **Node.js**: v18+ (tested on Node 20+)
- **Python**: v3.11+
- **MongoDB**: Local community edition running on port `27017`

---

## 🚀 Setup & Launching

### 1. Database Setup
First, ensure that your MongoDB instance is running locally. On macOS (Homebrew):
```bash
# Start MongoDB Community Server
brew services start mongodb/brew/mongodb-community
```

To seed the local database (`outreach_db`) with mock profiles, campaigns, and contacts:
```bash
cd backend
PYTHONPATH=. .venv/bin/python tests/setup_mock_db.py
```

### 2. Backend Setup & Run
Create the virtual environment, install requirements, and run the FastAPI server:
```bash
cd backend

# Create Virtual Environment (if not done)
python3 -m venv .venv
source .venv/bin/activate

# Install Requirements
pip install -r requirements.txt

# Run Unit Tests
PYTHONPATH=. .venv/bin/python tests/test_crm.py
PYTHONPATH=. .venv/bin/python tests/test_followups.py
PYTHONPATH=. .venv/bin/python tests/test_campaigns.py
PYTHONPATH=. .venv/bin/python tests/test_email_sender.py
PYTHONPATH=. .venv/bin/python tests/test_inbox_monitor.py

# Start FastAPI Dev Server
uvicorn app.main:app --reload --port 8000
```
The FastAPI documentation is accessible at: [http://localhost:8000/docs](http://localhost:8000/docs)

### 3. Frontend Setup & Run
Install dependencies and launch the Next.js dev server:
```bash
cd frontend

# Install dependencies
npm install

# Run Development Server
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the OutreachAI Dashboard.

To run production builds:
```bash
cd frontend
npm run build
npm run start
```

---

## 📂 Codebase Architecture

```
.
├── backend
│   ├── app
│   │   ├── api          # API endpoints (campaigns, crm, followups, settings)
│   │   ├── core         # DB connection and config management
│   │   ├── schemas      # Pydantic validation schemas
│   │   └── services     # Email sender, IMAP scanner, Groq AI parser
│   └── tests            # Python mock seeding and unit test suites
└── frontend
    ├── app              # Next.js App Router (dashboard, campaigns, search, profile)
    ├── components       # Layout components, progress bars, confirm modals
    └── utils            # API fetch/axios helper modules
```

---

## 🎨 UI Guidelines
This project uses **Vanilla CSS** (`globals.css`) designed to render a premium glassmorphic dark-mode palette. Avoid using Tailwind CSS utility overrides unless explicitly configured.