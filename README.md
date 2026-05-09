# Code Evaluator AI Agent

> **Version:** 1.0.0  &nbsp;|&nbsp;  **Status:** Production Ready
> **Dependencies:** 0 (zero npm packages)  &nbsp;|&nbsp;  **Languages Supported:** Java, Python, JavaScript
> **Engine:** Multi-Provider AI Fallback Chain + Enhanced Rule-Based Scoring

A full-stack web application for conducting interactive coding assessments with AI-powered code review, anti-cheating detection, a panelist dashboard for reviewing results, and built-in candidate feedback. Built on **pure Node.js** — no `npm install` step, no third-party packages.

---

## Table of Contents

1. [Quick Start](#1-quick-start)
2. [Project Structure](#2-project-structure)
3. [Features](#3-features)
4. [Assessment Flow](#4-assessment-flow)
5. [Panelist Dashboard](#5-panelist-dashboard)
6. [Candidate Feedback](#6-candidate-feedback)
7. [Configuration](#7-configuration)
8. [Environment Variables](#8-environment-variables)
9. [API Reference](#9-api-reference)
10. [AI Code Review & Scoring](#10-ai-code-review--scoring)
11. [Anti-Cheating System](#11-anti-cheating-system)
12. [Results & Analytics](#12-results--analytics)
13. [Question Bank](#13-question-bank)
14. [Logging](#14-logging)
15. [Deployment](#15-deployment)
16. [Customization](#16-customization)
17. [Troubleshooting](#17-troubleshooting)
18. [Technology Stack](#18-technology-stack)
19. [Security](#19-security)
20. [License](#20-license)

---

## 1. Quick Start

### Prerequisites

- **Node.js** v12 or higher — https://nodejs.org/
- **Java JDK 8+** — only required if candidates will run Java code locally
- **Python 3.6+** — only required if candidates will run Python code locally
- **(Optional) Ollama** — for fully-local AI code review — https://ollama.ai/

### Installation & Running

```bash
# Clone the repo, then from the project root:

# Linux / Mac
chmod +x start.sh
./start.sh

# Windows
start.bat

# Or, on any platform:
node src/server.js
```

The server listens on **http://localhost:3000** by default.

### First Test (No Email Setup Needed)

1. Open `http://localhost:3000`
2. Enter any email — e.g. `test@example.com`
3. Look at the Node.js server console — the 6-digit OTP is printed there as a fallback when SMTP isn't configured
4. Enter the OTP → enter name & experience → accept instructions
5. Solve the question → click **Run Code** → click **Agent Score**

---

## 2. Project Structure

```
CodeEvaluator_AI_Agent/
├── src/
│   ├── server.js              # Pure Node.js backend — all API routes
│   └── logger.js              # Custom logging (file + memory + API)
├── public/
│   ├── index.html             # Candidate single-page app (5-step flow)
│   ├── app.js                 # Frontend logic & state management
│   ├── styles.css             # Candidate UI styling
│   ├── panelist.html          # Panelist dashboard
│   ├── panelist.js            # Panelist dashboard logic
│   └── panelist-styles.css    # Panelist dashboard styling
├── data/
│   ├── config.js              # Centralized assessment configuration
│   ├── questions.json         # 25 programming questions
│   ├── candidate-emails.csv   # Authorized candidate emails (one per line)
│   └── panelist-emails.csv    # Authorized panelist emails (one per line)
├── results/                   # Auto-created at runtime
│   ├── json/                  # Full assessment JSON (one per session)
│   └── csv/                   # Per-candidate + daily consolidated CSVs
├── logs/                      # Auto-created — server logs (rotating, 5 MB)
├── .env                       # Local secrets (NOT committed)
├── .env.example               # Template — copy to .env and fill in
├── package.json               # Zero dependencies
├── render.yaml                # Render.com one-click deploy config
├── Dockerfile                 # Container build (Render / Railway / self-hosted)
└── start.sh / start.bat       # Platform launchers
```

---

## 3. Features

### Core Assessment

- **OTP-based login** — secure access via email one-time passwords
- **Email allowlist** — only pre-approved emails can take the test (CSV-driven)
- **Timed coding challenges** — 10 or 15 minutes per question depending on difficulty
- **Java, Python, JavaScript** — pick a preferred language; switch tabs while coding
- **CodeMirror editor** — syntax highlighting, bracket matching, auto-close
- **Real-time output validation** — expected vs actual output comparison
- **AI code review** — correctness scoring from up to four providers
- **Anti-cheating detection** — 13 behavioral metrics for AI/copy-paste detection
- **Tab-switch monitoring** — flagged in results
- **Auto-save** — session state to `localStorage` every 30 seconds
- **Resume capability** — interrupted sessions can be continued (within 2 hours)

### AI Provider Fallback Chain

1. **Google Gemini** — primary (free tier, supports multiple keys/models with round-robin)
2. **Claude (Anthropic)** — secondary
3. **OpenAI** — tertiary
4. **Ollama** — local fallback (free, runs on the host)
5. **Enhanced Rule-Based Engine** — final offline fallback (zero latency, deterministic)

### Panelist Dashboard

- View every candidate's session by date
- Per-question code, expected/actual output, AI score, AI-likelihood, tab switches, time
- Download daily summary as CSV or PDF
- Manage candidate & panelist email allowlists from the UI

### Email System

- Resend API (HTTPS — works through corporate firewalls)
- Custom SMTP client (Office 365, Gmail) with TLS / STARTTLS
- Console fallback (OTP printed to terminal if neither configured)
- Rate limit: 5 OTP requests per 10 minutes per email

### Candidate Feedback

- Floating "Feedback" button on the candidate UI
- Submissions sent to a dedicated inbox via the `FEEDBACK_RECIPIENT` env var

---

## 4. Assessment Flow

```
Step 0 — Login
    Enter email → receive OTP (email or console)
    Enter 6-digit OTP → session token issued

Step 1 — Role Selection (panelist emails only)
    Candidate (take the test)  |  Panelist (review results)

Step 2 — Candidate Details
    Name, experience (X.Y years), preferred language

Step 3 — Instructions
    9 assessment rules → consent checkbox → Start Assessment

Step 4 — Coding Challenge
    Question, example, language tabs, CodeMirror editor
    Run Code → Output validation
    Get AI Score → Per-question or bulk
    Previous / Next, timer per question
    Mark Complete → final Submit

Step 5 — Results Dashboard
    Per-question cards (code, status, AI review)
    View Performance CSV / All Candidates Summary / Pie chart
    Download reports
```

### Experience Tiers & Question Selection

| Experience | Questions Assigned |
|---|---|
| 0 – 4 years | 1 moderate |
| 4 – 6 years | 2 moderate |
| 6+ years | 1 moderate + 1 complex |

### Per-Question Time Limits

| Difficulty | Time |
|---|---|
| Moderate | 10 minutes |
| Complex | 15 minutes |

---

## 5. Panelist Dashboard

After OTP verification, any email listed in `data/panelist-emails.csv` sees a role-selection prompt. Choosing **Panelist** opens `/panelist.html`.

### What the dashboard offers

- **Date filter** — pick any date to load that day's submissions
- **Summary cards** — total candidates, breakdown by score band (Excellent / Good / Average / Poor)
- **Candidate table** — name, email, location, experience, language, programs completed, test score, agent score, plagiarism avg/max, tab switches, total time, submitted-at
- **View Code & Results** button per candidate — full per-question breakdown including submitted code, expected vs actual output, AI suggestions, AI-detection reasons
- **Download CSV** — daily summary export
- **Manage Candidate Emails** — bulk add/remove emails from the candidate allowlist
- **Manage Panelist Emails** — bulk add/remove emails from the panelist allowlist

### Adding a panelist

Two equivalent options:

1. **From the dashboard:** "Manage Panelist Emails" → paste emails → Save
2. **Edit the CSV:** add an email row to `data/panelist-emails.csv`, then call `POST /api/panelist-emails/reload` (or restart the server)

The CSV needs a header row of `email` and one address per line.

---

## 6. Candidate Feedback

A floating "Feedback" button is always visible on the candidate UI. Submissions are emailed to the address configured in the `FEEDBACK_RECIPIENT` env var.

### Setup

Add to your `.env` (or your Render / Railway environment settings):

```dotenv
FEEDBACK_RECIPIENT=cognizanttest9871@gmail.com
```

If `FEEDBACK_RECIPIENT` is unset, feedback is delivered to the SMTP user account (legacy behavior).

The email body includes the candidate's name, email, submission timestamp (IST), and feedback text. The `Reply-To` header is set to the candidate's email so panelists can respond directly.

---

## 7. Configuration

### Centralized config — `data/config.js`

Both server (`src/server.js`) and frontend (`public/app.js`) read from this single file. Common settings:

| Setting | Default | Purpose |
|---|---|---|
| `panelistEmailsCsvPath` | `./data/panelist-emails.csv` | CSV of authorized panelist emails |
| `candidateEmailsCsvPath` | `./data/candidate-emails.csv` | CSV of authorized candidate emails |
| `candidateEmailVerification` | `true` | If `false`, any email can take the test |
| `maxExperienceYears` | `20` | Validation cap |
| `questionTimeLimits.moderate` | `600` (s) | 10 min for moderate questions |
| `questionTimeLimits.complex` | `900` (s) | 15 min for complex questions |
| `tabSwitchFreezeLimit` | `3` | Max tab switches before freeze |
| `instructionReadTimer` | `120` (s) | Auto-advance from instructions page |

### Adding / removing emails

Edit `data/candidate-emails.csv` or `data/panelist-emails.csv`. Each file looks like:

```csv
email
alice@example.com
bob@example.com
```

Or use the dashboard's "Manage Emails" buttons (recommended — no restart needed).

---

## 8. Environment Variables

Copy `.env.example` to `.env` and fill in only the values you need. Everything is optional — the app falls back gracefully when secrets are missing.

```dotenv
# ─── Server ──────────────────────────────────────
# PORT is auto-set by Render / Railway. Override only for local dev.
# PORT=3000

# ─── Email Provider ──────────────────────────────
EMAIL_PROVIDER=auto                # 'resend' | 'smtp' | 'auto'

# Resend (recommended — HTTPS, works through firewalls)
RESEND_API_KEY=re_xxxxxxxxxxxx
RESEND_FROM=Code Evaluator <onboarding@resend.dev>

# Office 365 / corporate SMTP
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=your_email@company.com
SMTP_PASS=your_password
SMTP_FROM=Code Evaluator

# Gmail SMTP — use a Google App Password, not the account password
GMAIL_SMTP_HOST=smtp.gmail.com
GMAIL_SMTP_PORT=587
GMAIL_SMTP_USER=your.email@gmail.com
GMAIL_SMTP_PASS=xxxx xxxx xxxx xxxx
GMAIL_SMTP_FROM=Code Evaluator

# ─── Feedback Inbox ──────────────────────────────
# All candidate feedback is delivered to this address.
FEEDBACK_RECIPIENT=cognizanttest9871@gmail.com

# ─── AI Providers ────────────────────────────────
# Google Gemini — primary (free, supports multiple keys with round-robin)
GEMINI_API_KEY=your_gemini_key
# Or rotate across many keys:
# GEMINI_API_KEYS=key1,key2,key3
GEMINI_MODEL=gemini-2.0-flash
# Or rotate across models:
# GEMINI_MODELS=gemini-2.0-flash,gemini-1.5-pro

# Claude (Anthropic) — secondary
USE_CLAUDE=false
CLAUDE_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-opus-4-0-20250514
CLAUDE_BASE_URL=
CLAUDE_TIMEOUT_MS=30000

# OpenAI — tertiary
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-3.5-turbo

# Ollama — local fallback (only works where the Ollama process is running)
USE_OLLAMA=false
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3
```

> **Security note:** never commit a real `.env` file. The `.env.example` should contain placeholders only.

---

## 9. API Reference

### Public / candidate-facing

| # | Method | Path | Description |
|---|---|---|---|
| 1 | POST | `/api/auth/send-otp` | Send OTP to email |
| 2 | POST | `/api/auth/verify-otp` | Verify OTP, get session token |
| 3 | GET | `/api/version` | App version + IST timestamp |
| 4 | GET | `/api/health/runtime` | Java/Python/Node availability |
| 5 | GET | `/api/config` | Frontend config (timers, tiers) |
| 6 | GET | `/api/questions` | Question list (filtered by experience) |
| 7 | GET | `/api/questions/:id` | Single question by ID |
| 8 | POST | `/api/execute/java` | Compile + run Java code |
| 9 | POST | `/api/execute/python` | Run Python code |
| 10 | POST | `/api/execute/javascript` | Run JavaScript code |
| 11 | POST | `/api/agent/assist` | AI code review (returns 0–100% score) |
| 12 | POST | `/api/result` | Save assessment results (writes JSON + CSV) |
| 13 | POST | `/api/feedback` | Submit candidate feedback |
| 14 | GET | `/api/candidate-performance` | Candidate's CSV data |
| 15 | GET | `/api/download/csv` | Download a candidate's CSV |
| 16 | GET | `/api/all-candidates-summary` | Daily roll-up |
| 17 | GET | `/api/pie-chart-data` | Completion pie data |
| 18 | GET | `/api/logs?lines=100` | Recent server logs |

### Panelist dashboard

| # | Method | Path | Description |
|---|---|---|---|
| 19 | GET | `/api/panelist/daily-summary?date=YYYY-MM-DD` | All candidates for a date |
| 20 | GET | `/api/panelist/candidate-session/:id` | Full session details for a candidate |
| 21 | GET | `/api/panelist/export-csv?date=YYYY-MM-DD` | Daily summary as CSV |
| 22 | GET | `/api/panelist/export-pdf?date=YYYY-MM-DD` | Daily summary as PDF |

### Email allowlist management

| # | Method | Path | Description |
|---|---|---|---|
| 23 | GET | `/api/candidate-emails` | List authorized candidate emails |
| 24 | POST | `/api/candidate-emails/add` | Add a single candidate email |
| 25 | POST | `/api/candidate-emails/remove` | Remove a single candidate email |
| 26 | POST | `/api/candidate-emails/bulk-add` | Bulk add candidate emails |
| 27 | POST | `/api/candidate-emails/bulk-remove` | Bulk remove candidate emails |
| 28 | POST | `/api/candidate-emails/reload` | Re-read CSV from disk |
| 29 | POST | `/api/candidate-emails/reset-login` | Allow a candidate to log in again |
| 30 | GET | `/api/panelist-emails` | List authorized panelist emails |
| 31 | POST | `/api/panelist-emails/add` | Add a single panelist email |
| 32 | POST | `/api/panelist-emails/remove` | Remove a single panelist email |
| 33 | POST | `/api/panelist-emails/bulk-add` | Bulk add panelist emails |
| 34 | POST | `/api/panelist-emails/bulk-remove` | Bulk remove panelist emails |
| 35 | POST | `/api/panelist-emails/reload` | Re-read CSV from disk |

---

## 10. AI Code Review & Scoring

### Architecture

```
Client → POST /api/agent/assist
    │
    ├─ outputMatched === false?  →  return 0% immediately
    │
    └─ AI Provider Fallback Chain
         1. Gemini  (round-robin keys + models)
         2. Claude
         3. OpenAI
         4. Ollama  (local LLM)
              ↓ all providers fail
         5. Rule-Based Engine  (deterministic, zero latency)
                    ↓
             Final score 0–100%
```

All providers receive the same system prompt and are required to return:
```
SCORE: <0–100>
COVERED: <bullet list>
MISSED: <bullet list>
```

### 7-Category Scoring Rubric (100 pts)

| # | Category | Pts | Evaluates |
|---|---|---|---|
| 1 | Output Correctness | 25 | Output statement, format match, alignment with template |
| 2 | Logic & Algorithm | 20 | Control flow, semantic correctness, data handling |
| 3 | Code Structure | 10 | Class/function definitions, helper methods, declarations |
| 4 | Problem-Specific Relevance | 15 | Right algorithm for the problem (37-pattern database) |
| 5 | Code Quality & Style | 10 | Naming, readability, formatting, dead code |
| 6 | Edge Cases & Robustness | 10 | Null/empty guards, error handling, boundaries |
| 7 | Efficiency & Complexity | 10 | Time complexity, anti-patterns, resource use |

### Score Bands

| Score | Label | Meaning |
|---|---|---|
| 90 – 100 | Excellent | Complete, correct, well-structured |
| 75 – 89 | Good | Solid with minor issues |
| 50 – 74 | Partial | Core logic present but incomplete |
| 25 – 49 | Needs Work | Significant problems |
| 0 – 24 | Fails | Missing core logic or hardcoded |
| 0 | Hardcoded | Print statements only, no algorithm |

### Hardcoded Detection

The engine strips boilerplate (imports, class declarations, comments) and checks the remainder for any logic indicator (loops, conditions, data structures, method calls, math, recursion, variable logic). If none are found, the score is **0%** regardless of output match.

---

## 11. Anti-Cheating System

13 behavioral metrics produce a per-question AI-likelihood score with reasons:

| # | Metric | What it detects |
|---|---|---|
| 1 | Keystroke ratio | Few keystrokes vs. code length → likely paste |
| 2 | Burst paste | Large blocks appearing instantly |
| 3 | Tab-switch code change | Significant changes after tab switching |
| 4 | Typing speed | Unrealistic speed = automation |
| 5 | Watch-and-type | Frequent tab switches with code additions |
| 6 | Pause-then-type | Long reading pauses before typing |
| 7 | Idle ratio | High idle time + tab switches |
| 8 | Rapid tab switching | Quick repeated tab changes |
| 9 | Rhythmic pauses | Uniform pause durations (robotic) |
| 10 | Uniform session sizes | Consistent typing chunks |
| 11 | Low deletion ratio | No corrections (paste indicator) |
| 12 | Linear entry | Strict top-to-bottom, 0% back-jumps |
| 13 | Mouse inactivity | Near-zero mouse movement during typing |

Each metric scores 0–100% and is shown alongside reasons in the panelist view.

---

## 12. Results & Analytics

### File outputs (auto-generated)

```
results/json/
    <Candidate>-coding-results-<timestamp>.json   # full session record
results/csv/
    <Candidate>-performance.csv                   # per-candidate detail
    all-candidates-summary-<YYYY-MM-DD>.csv       # daily roll-up
```

> **Note on filenames:** the candidate's name is sanitized (non-alphanumeric → `_`) when used in filenames. So `MANVITHA JUTURU` becomes `MANVITHA_JUTURU` on disk.

### Per-Candidate CSV columns

```
Date, Time, Candidate Name, Candidate EmailId, Location,
Relevant Experience (Years), Question #, Question Title, Status,
Language, Expected Output, Actual Output, Agent Score (%),
Plagiarism (%), Plagiarism Reasons, Session Completion (%),
Session Agent Analysis Avg (%), Tab Switches, Question Time Spent,
Total Time Taken
```

### Daily Consolidated CSV columns

```
Date, Time, Candidate Name, Candidate Emailid, Location,
Relevant Experience (Years), Language Preferred, Correct Programs,
Test Execution Score (%), Agent Score (%), Plagiarism Avg (%),
Plagiarism Max (%), Q1 Tab Switches, Q2 Tab Switches, ...,
Total Tab Switches, Total Time Taken
```

### Persistence on cloud platforms

If you deploy to Render / Railway, attach a **persistent disk** mounted at the project root (or specifically at `results/`). Without it, files in `results/` are lost on every redeploy.

---

## 13. Question Bank

25 questions in `data/questions.json`:

### Moderate (10 min each)

String Reversal · Palindrome Check · Count Vowels · Remove Duplicates from String · Find Maximum in Array · Remove Duplicates from Array · Prime Number Checker · Fibonacci Series · Armstrong Number · Factorial Calculation · String Anagram Check · Reverse Array · Common Elements in Arrays · Sum of Digits · Leap Year Checker · Permutation Check · Missing Number in Array · Intersection of Two Arrays · GCD Calculation

### Complex (15 min each)

Merge Sorted Arrays · Binary Search · Longest Substring Without Repeating Characters · Rotation Check · Word Frequency Counter · Sorting Algorithms Comparison

### Adding a custom question

Append an entry to `data/questions.json`:

```json
{
  "id": 26,
  "title": "Your Question Title",
  "description": "What the candidate should do",
  "example": "Input: example_input\nOutput: expected_output",
  "difficulty": "moderate",
  "javaTemplate":   "public class Solution { ... }",
  "pythonTemplate": "# Write your solution here",
  "javascriptTemplate": "// Write your solution here"
}
```

Restart the server (or hit `/api/questions` to verify it loaded).

---

## 14. Logging

All server `console.log / error / warn` output is intercepted by `src/logger.js` and routed to:

- `logs/server.log` — rotating file, 5 MB max, last 5 backups
- in-memory ring buffer — last 500 lines, exposed via `GET /api/logs?lines=100`
- the original console — still visible in the terminal / Render log stream

Format: `[2026-04-12T10:30:45.123Z] [LOG] message`

---

## 15. Deployment

### Render.com (recommended — `render.yaml` is preconfigured)

1. Push the repo to GitHub
2. New Web Service on Render → connect the repo
3. Add environment variables (Settings → Environment):
   - `FEEDBACK_RECIPIENT`
   - `GMAIL_SMTP_USER`, `GMAIL_SMTP_PASS` (or `RESEND_API_KEY`)
   - AI provider keys you want to use
4. Attach a persistent disk if you want `results/` to survive redeploys
5. Save → Render builds and deploys automatically

### Docker

```bash
docker build -t code-evaluator .
docker run -p 3000:3000 --env-file .env code-evaluator
```

### Railway

`railway.json` is preconfigured for a Dockerfile build:

```bash
railway up
```

### Bare Node.js host

```bash
node src/server.js
```

---

## 16. Customization

### Timers and limits — `data/config.js`

| Setting | Default | Purpose |
|---|---|---|
| `questionTimeLimits.moderate` | `600` | 10-min timer for moderate |
| `questionTimeLimits.complex` | `900` | 15-min timer for complex |
| `tabSwitchFreezeLimit` | `3` | Max tab switches before UI freezes |
| `instructionReadTimer` | `120` | Auto-advance from instructions page |

### Styling

- Candidate UI: `public/styles.css` (CSS variables at the top control colors)
- Panelist UI: `public/panelist-styles.css`

### Email provider selection

Set `EMAIL_PROVIDER` in `.env`:
- `resend` — Resend API only
- `smtp` — SMTP only
- `auto` — try Resend → SMTP → console fallback

---

## 17. Troubleshooting

| Problem | Solution |
|---|---|
| Server won't start | Confirm Node.js v12+. Check port 3000: `lsof -i :3000` (mac/linux) or `netstat -ano \| findstr :3000` (windows) |
| Java code won't execute | Install JDK (not JRE) and add to PATH. Test: `java -version` |
| Python code won't execute | Install Python 3.6+ and add to PATH. Test: `python --version` |
| OTP not arriving | Always printed to the server console as a fallback. For real email, configure Resend or SMTP in `.env` |
| AI agent timeout | Ollama's first call may take ~160 s while the model loads. For cloud providers, verify the API key |
| Session lost | Auto-saved every 30 s. Reload shows a "Resume Assessment?" dialog. Expires after 2 hours |
| Port in use | Set `PORT=3001` in `.env`, or change the default in `src/server.js` |
| Panelist sees "Failed to load session details" | The candidate's filename on disk uses sanitized name (spaces → `_`). Latest server.js handles this — make sure you're on a recent build |
| Feedback emails not arriving | Verify `FEEDBACK_RECIPIENT` is set, and that SMTP credentials work. Check the server log for `[Feedback SMTP]` lines |
| Results disappear after redeploy | Cloud platforms have ephemeral filesystems by default. Attach a persistent disk mounted at project root |

---

## 18. Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| Backend | Node.js v12+ | Built-in modules only — `http`, `https`, `fs`, `path`, `crypto`, `child_process`, `net`, `tls` |
| Frontend | Vanilla JS + HTML5 + CSS3 | No frameworks, single-page app |
| Code Editor | CodeMirror 5 | Bundled in `public/lib/codemirror/` |
| Storage | Local filesystem | JSON + CSV in `results/` |
| Email | Custom SMTP + Resend API | TLS / STARTTLS support |
| AI | Cloud APIs + local | Gemini, Claude, OpenAI, Ollama, Rule Engine |
| Code execution | `child_process` | 5-second timeout, auto-cleanup of temp files |

### Project Statistics

| Metric | Value |
|---|---|
| Total LOC | ~8,000 |
| `src/server.js` | ~5,300 LOC |
| `public/app.js` | ~3,700 LOC |
| API routes | 35+ |
| Programming questions | 25 |
| Anti-cheat metrics | 13 |
| AI providers | 4 + rule engine |
| Languages supported | 3 (Java, Python, JavaScript) |
| npm dependencies | 0 |

---

## 19. Security

| Feature | Implementation |
|---|---|
| OTP comparison | Constant-time via `crypto.timingSafeEqual` (prevents timing attacks) |
| Session tokens | Cryptographically random, 32 bytes |
| Rate limiting | 5 OTP requests per 10-minute window per email |
| OTP expiry | 5 minutes |
| Max OTP attempts | 3 per code |
| Email allowlist | Both candidate and panelist routes are gated by CSV files |
| Copy/paste blocking | Configurable event interception in candidate UI |
| Code execution timeout | 5 seconds per run |
| Temp file cleanup | Automatic after each execution |
| SMTP security | TLS / STARTTLS |
| Request body limit | 50 MB |

### Security checklist before production

- [ ] `.env` is git-ignored (and verified — `git ls-files | grep .env`)
- [ ] No real credentials in `.env.example` — only placeholders
- [ ] If you're using Gmail SMTP, you're using a Google **App Password**, not the account password
- [ ] `candidateEmailVerification: true` in `data/config.js`
- [ ] Production AI API keys are different from development keys
- [ ] HTTPS is enforced (Render / Railway do this by default)

---

## 20. License

MIT

---

**Built with pure Node.js — zero npm dependencies required.**
