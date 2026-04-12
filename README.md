# Code Evaluator AI Agent

> **Version:** 1.0.0 | **Date:** April 2026 | **Status:** Production Ready  
> **Dependencies:** 0 (Zero!) | **Languages:** Java, Python, JavaScript  
> **Engine:** Enhanced Rule-Based Scoring + Multi-Provider AI Fallback Chain

A comprehensive full-stack web application for interactive coding assessments with AI-powered code review, built with **zero npm dependencies** using only Node.js built-in modules.

---

## Table of Contents

1. [Quick Start](#1-quick-start)
2. [Project Structure](#2-project-structure)
3. [Features Overview](#3-features-overview)
4. [Assessment Flow](#4-assessment-flow)
5. [Configuration](#5-configuration)
6. [API Endpoints](#6-api-endpoints)
7. [AI Code Review & Scoring Logic](#7-ai-code-review--scoring-logic)
8. [Anti-Cheating System](#8-anti-cheating-system)
9. [Results & Analytics](#9-results--analytics)
10. [Question Bank](#10-question-bank)
11. [Logging System](#11-logging-system)
12. [VS Code Integration](#12-vs-code-integration)
13. [Deployment](#13-deployment)
14. [Customization](#14-customization)
15. [Troubleshooting](#15-troubleshooting)
16. [Technology Stack](#16-technology-stack)
17. [Security](#17-security)

---

## 1. Quick Start

### Prerequisites

- **Node.js** v12+ (install from https://nodejs.org/)
- **Java** JDK 8+ (optional, for Java code execution)
- **Python** 3.6+ (optional, for Python code execution)
- **(Optional) Ollama** for local AI code review (https://ollama.ai/)

### Installation & Running

**Windows:**
```batch
start.bat
```

**Linux/Mac:**
```bash
chmod +x start.sh
./start.sh
```

**Manual:**
```bash
node src/server.js
```

Then open your browser at: **http://localhost:3000**

### First Test (No Email Required)

1. Enter any email: `test@example.com`
2. Check the **Node.js server console** for the 6-digit OTP
3. Enter OTP in browser → Enter name & experience → Accept instructions
4. Start solving questions → Run code → Ask AI Agent for score

---

## 2. Project Structure

```
CodePracticeAIAgent/
├── src/
│   ├── server.js              # Pure Node.js backend (all API routes)
│   └── logger.js              # Custom logging (file + memory + API)
├── public/
│   ├── index.html             # Single-page app (5-step assessment)
│   ├── app.js                 # All frontend logic & state management
│   ├── styles.css             # Responsive styling
│   └── lib/
│       └── codemirror/        # CodeMirror editor (bundled)
│           ├── codemirror.min.js / .css
│           ├── material.min.css
│           ├── addon/         # closebrackets, comment, matchbrackets
│           └── mode/          # clike, javascript, python
├── data/
│   └── questions.json         # 25 programming questions
├── results/                   # Auto-created on first run
│   ├── json/                  # Full assessment results (JSON)
│   └── csv/                   # Performance data (CSV)
├── logs/                      # Auto-created
│   └── server.log             # Rotating log file (5 MB max)
├── temp/                      # Temporary code execution files (auto-cleaned)
├── .env                       # Configuration (email, AI keys, etc.)
├── package.json               # Zero dependencies
├── start.bat / start.sh       # Platform launchers
├── setup-runtimes.bat / .sh   # Optional: download portable runtimes
├── Dockerfile                 # Docker support
├── railway.json               # Railway deployment config
└── render.yaml                # Render deployment config
```

---

## 3. Features Overview

### Core Assessment
- ✅ **OTP-based Login** — Secure access via email one-time passwords
- ✅ **Timed Coding Challenges** — 10–15 minute questions based on difficulty
- ✅ **Java, Python & JavaScript Support** — Write and execute code in three languages
- ✅ **Live Code Editor** — CodeMirror 5 with syntax highlighting, bracket matching, auto-close
- ✅ **Real-time Output Validation** — Compare expected vs actual output
- ✅ **AI-Powered Code Review** — Correctness scores from Gemini, Claude, OpenAI, or Ollama
- ✅ **Anti-Cheating Detection** — 13-metric AI-generated code detection system
- ✅ **Tab Switch Monitoring** — Detects when candidates switch windows/tabs
- ✅ **Session Auto-Save** — Every 30 seconds to localStorage
- ✅ **Resume Capability** — Continue interrupted assessments (up to 2 hours)

### AI Integration (4 Providers with Fallback)
1. **Google Gemini** — Primary (free, round-robin keys + models)
2. **Claude (Anthropic)** — Secondary
3. **OpenAI** — Tertiary (gpt-3.5-turbo)
4. **Ollama** — Local fallback (free, requires local installation)
5. **Enhanced Rule-Based Engine** — Final offline fallback (zero latency, deterministic)

### Results & Analytics
- Per-candidate CSV with detailed metrics
- Daily consolidated CSV for all candidates
- JSON results with full assessment records
- Performance dashboard with filterable tables
- Candidate Code & Results viewer (per-question cards)
- Completion pie charts

### Email System
- Resend API (HTTPS, recommended)
- Custom SMTP client (Office 365, Gmail, etc.) with TLS/STARTTLS
- Console fallback (OTP printed to terminal)
- Rate limiting (5 OTP requests per 10 minutes)

---

## 4. Assessment Flow

```
Step 0: Login
├─ Enter email → Receive OTP (email or console)
├─ Enter 6-digit OTP
└─ Session token issued

Step 2: Candidate Details
├─ Name input
├─ Experience input (X.Y years)
└─ Total questions count display

Step 1: Instructions
├─ 9 assessment rules displayed
├─ Consent checkbox
└─ Start Assessment button

Step 3: Coding Challenge
├─ Question title, description, example
├─ Language tabs (Java / Python / JavaScript)
├─ CodeMirror editor with syntax highlighting
├─ Run Code → Output validation
├─ AI Code Review Score (single or bulk)
├─ Previous / Next navigation
├─ Timer per question (10 or 15 min)
└─ Mark Complete / Submit

Step 4: Results Dashboard
├─ Score display (X/Y correct)
├─ Per-question cards with code, status, AI review
├─ View Candidate Code & Results (new window)
├─ View Candidate Performance (CSV table)
├─ View All Candidates Summary
└─ Download reports
```

### Experience Tiers & Question Selection

| Experience | Questions Assigned |
|------------|-------------------|
| 0–4 years | 1 moderate question |
| 4–6 years | 2 moderate questions |
| 6+ years | 1 moderate + 1 complex question |

### Timers

| Difficulty | Time per Question |
|------------|-------------------|
| Moderate | 10 minutes |
| Complex | 15 minutes |

---

## 5. Configuration

### Environment Variables (.env)

```env
# ───── Email Provider ─────
EMAIL_PROVIDER=auto          # 'resend', 'smtp', or 'auto'

# Resend (recommended — works everywhere)
RESEND_API_KEY=re_xxxxxxxxxxxx
RESEND_FROM=Code Evaluator <sender@resend.dev>

# SMTP (Office 365, Gmail, etc.)
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=your_email@company.com
SMTP_PASS=your_password
SMTP_FROM=Code Evaluator

# Gmail-specific
GMAIL_SMTP_HOST=smtp.gmail.com
GMAIL_SMTP_PORT=587
GMAIL_SMTP_USER=your.email@gmail.com
GMAIL_SMTP_PASS=your_app_password     # Use App Password, not regular
GMAIL_SMTP_FROM=Code Evaluator

# ───── AI Providers ─────
# Google Gemini (primary — free, supports multiple keys)
GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-2.0-flash

# Claude (Anthropic)
USE_CLAUDE=false
CLAUDE_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-opus-4-0-20250514

# OpenAI
OPENAI_API_KEY=sk-...

# Ollama (local, free)
USE_OLLAMA=true
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3
```

---

## 6. API Endpoints

| # | Method | Path | Description |
|---|--------|------|-------------|
| 1 | POST | `/api/auth/send-otp` | Send OTP to email |
| 2 | POST | `/api/auth/verify-otp` | Verify OTP & get session token |
| 3 | GET | `/api/version` | Get app version & IST timestamp |
| 4 | GET | `/api/health/runtime` | Check Java/Python/Node availability |
| 5 | GET | `/api/config` | Get experience tiers, timers, settings |
| 6 | GET | `/api/questions` | Get questions (with experience filter) |
| 7 | GET | `/api/questions/:id` | Get single question by ID |
| 8 | POST | `/api/execute/java` | Compile & execute Java code |
| 9 | POST | `/api/execute/python` | Execute Python code |
| 10 | POST | `/api/execute/javascript` | Execute JavaScript code |
| 11 | POST | `/api/agent/assist` | AI code review (percentage scoring) |
| 12 | POST | `/api/result` | Save assessment results (JSON + CSV) |
| 13 | GET | `/api/candidate-performance` | Get candidate's performance CSV data |
| 14 | GET | `/api/download/csv` | Download candidate's CSV file |
| 15 | GET | `/api/all-candidates-summary` | Get all candidates' daily summary |
| 16 | GET | `/api/pie-chart-data` | Get completion pie chart data |
| 17 | GET | `/api/logs` | Get recent server logs |

---

## 7. AI Code Review & Scoring Logic

### Architecture

```
Client Request (/api/agent/assist)
        │
        ▼
┌───────────────────────┐
│  Output Match Check   │──── outputMatched === false → 0% immediately
└───────────┬───────────┘
            │
            ▼
┌───────────────────────────────────────────────┐
│         AI PROVIDER FALLBACK CHAIN            │
│                                               │
│  1. Google Gemini (PRIMARY — free, round-robin│
│     keys + models)                            │
│  2. Claude (secondary)                        │
│  3. OpenAI (tertiary)                         │
│  4. Ollama (local LLM, last resort)           │
│                                               │
│  All providers use the same AI_SYSTEM_PROMPT  │
│  with 7-category scoring rubric               │
└───────────┬───────────────────────────────────┘
            │ All AI providers fail?
            ▼
┌───────────────────────────────────────────────┐
│     ENHANCED RULE-BASED SCORING ENGINE        │
│                                               │
│  7 deterministic scoring functions            │
│  No external API calls, zero latency          │
│  Uses regex & AST-like pattern matching       │
└───────────────────────────────────────────────┘
            │
            ▼
     Final Score (0–100%)
```

### 7-Category Scoring Rubric (100 points total)

| # | Category | Max Points | What It Evaluates |
|---|----------|-----------|-------------------|
| 1 | Output Correctness | 25 | Output statement, format match, logic alignment with template, input data |
| 2 | Logic & Algorithm | 20 | Control flow, semantic correctness, data handling, operator usage |
| 3 | Code Structure | 10 | Class/function definitions, helper methods, variable declarations |
| 4 | Problem-Specific Relevance | 15 | Correct algorithm/approach for the problem (37 pattern database) |
| 5 | Code Quality & Style | 10 | Naming conventions, readability, formatting, dead code detection |
| 6 | Edge Cases & Robustness | 10 | Null/empty guards, error handling, boundary awareness, type safety |
| 7 | Efficiency & Complexity | 10 | Time complexity, anti-patterns, algorithm choice, resource management |

### Score Interpretation Bands

| Score | Label | Description |
|-------|-------|-------------|
| 90–100 | Excellent | Complete, correct, well-structured solution |
| 75–89 | Good | Solid solution with minor issues |
| 50–74 | Partial | Core logic present but incomplete or has issues |
| 25–49 | Needs Work | Significant problems with logic or structure |
| 0–24 | Fails | Missing core logic or hardcoded output |
| 0 | Hardcoded | Only print statements, no actual algorithm |

### Hardcoded Output Detection

Strips boilerplate (imports, class declarations, comments) and checks if remaining code contains **any** logic indicators (loops, conditions, data structures, method calls, math, recursion, variable logic). If none found → **0%** immediately.

### Problem-Specific Pattern Database

The engine maintains **37 problem patterns** (e.g., "Reverse String", "Fibonacci", "Palindrome", "Sort by Value", etc.), each with keyword triggers and language-specific regex patterns for Java, Python, and JavaScript. The best-matching pattern determines the relevance score.

### AI Prompt Engineering

All AI providers receive the same system prompt with:
- Role definition ("code correctness evaluator")
- 7-category rubric with point allocations
- Scoring bands and rules
- Required response format: `SCORE: <number>`, `COVERED:`, `MISSED:`

---

## 8. Anti-Cheating System

13 behavioral metrics detect AI-generated or copied code:

| # | Metric | What It Detects |
|---|--------|-----------------|
| 1 | Keystroke Ratio | Too few keystrokes relative to code length = likely paste |
| 2 | Burst Paste Detection | Large code blocks appearing instantly |
| 3 | Tab Switch Code Changes | Significant code changes after switching tabs |
| 4 | Typing Speed | Unrealistic speeds indicate automation |
| 5 | Watch-and-Type Pattern | Frequent tab switches with code additions |
| 6 | Pause-Then-Type Rhythm | Long pauses before typing (reading from source) |
| 7 | Idle Ratio | High idle time combined with tab switches |
| 8 | Rapid Tab Switching | Quick, repeated tab changes |
| 9 | Rhythmic Pauses | Uniform pause durations (robotic pattern) |
| 10 | Uniform Session Sizes | Consistent typing chunks (transcription pattern) |
| 11 | Low Deletion Ratio | No corrections made (copy-paste indicator) |
| 12 | Linear Code Entry | Strictly top-to-bottom entry (0% back-jumps) |
| 13 | Mouse Inactivity | Near-zero mouse activity during typing |

Each metric produces a 0–100% score with detailed reasons displayed in results.

---

## 9. Results & Analytics

### Per-Candidate CSV

```
Date, Time, Candidate Name, Email, Experience, Question #, Question Title,
Status, Language, Expected Output, Actual Output, Agent Score (%),
AI Likelihood (%), AI Reasons, Session Completion (%),
Session Agent Analysis Avg (%), Tab Switches, Question Time Spent, Total Time Taken
```

### Daily Consolidated CSV

```
Date, Time, Candidate Name, Email, Experience, Correct Programs,
Test Execution Score (%), AI Code Review Score (%), AI Likelihood Avg (%),
AI Likelihood Max (%), Q1 Tab Switches, Q2 Tab Switches, ...,
Total Tab Switches, Total Time Taken
```

### JSON Results

Full assessment records saved to `results/json/` with candidate details, per-question code, outputs, agent scores, AI likelihoods, typing metrics, and timestamps.

### Performance Dashboard Tabs

- **Candidate Code & Results** — Per-question cards showing code (from the last AI Code Review), language, status, expected/actual output, covered/missed items, AI detection reasons
- **Candidate Performance** — Filterable CSV table with all per-question metrics (uses the last AI-reviewed language per question)
- **All Candidates Summary** — Daily overview with completion pie chart

---

## 10. Question Bank

25 questions covering moderate and complex difficulty:

### Moderate Difficulty (10 min each)
1. String Reversal
2. Palindrome Check
3. Count Vowels
4. Remove Duplicates from String
5. Find Maximum in Array
6. Remove Duplicates from Array
7. Prime Number Checker
8. Fibonacci Series
9. Armstrong Number
10. Factorial Calculation
11. String Anagram Check
12. Reverse Array
13. Common Elements in Arrays
14. Sum of Digits
15. Leap Year Checker
21. Permutation Check
22. Missing Number in Array
23. Intersection of Two Arrays
24. GCD Calculation

### Complex Difficulty (15 min each)
16. Merge Sorted Arrays
17. Binary Search Implementation
18. Longest Substring Without Repeating Characters
19. Rotation Check
20. Word Frequency Counter
25. Sorting Algorithms Comparison

### Adding Custom Questions

Edit `data/questions.json`:
```json
{
  "id": 26,
  "title": "Your Question Title",
  "description": "What the candidate should do",
  "example": "Input: example_input\nOutput: expected_output",
  "difficulty": "moderate",
  "javaTemplate": "public class Solution {\n  public static void main(String[] args) {\n    // template\n  }\n}",
  "pythonTemplate": "# Write your solution here",
  "javascriptTemplate": "// Write your solution here"
}
```

---

## 11. Logging System

### Overview

All server console output is captured by `src/logger.js`:

```
console.log / error / warn
       ↓
   logger.js (intercepts)
       ↓
   ├→ logs/server.log    (file, 5 MB rotation, last 5 backups)
   ├→ In-memory buffer   (last 500 lines)
   └→ Original console   (displayed in terminal / VS Code Output)
```

### API Access

```bash
# Get last 100 log lines
curl http://localhost:3000/api/logs?lines=100
```

### Log Format

```
[2026-04-12T10:30:45.123Z] [LOG] Server started on port 3000
[2026-04-12T10:30:46.456Z] [ERROR] Error occurred
[2026-04-12T10:30:47.789Z] [WARN] Warning message
```

---

## 12. VS Code Integration

### Tasks (`.vscode/tasks.json`)

| Task | Description |
|------|-------------|
| **Run Server (Output Tab)** | Start the server with output in VS Code Output panel |
| **View Server Logs** | Tail `logs/server.log` in real-time |
| **Clear Logs** | Delete all log files |

### Running via Task
1. `Ctrl+Shift+P` → "Tasks: Run Task"
2. Select "Run Server (Output Tab)"

### Running via Debug
1. `Ctrl+Shift+D` → Select "Run Server"
2. Click green play button

---

## 13. Deployment

### Docker

```bash
docker build -t code-evaluator .
docker run -p 3000:3000 --env-file .env code-evaluator
```

### Railway

Pre-configured via `railway.json`:
```bash
railway up
```

### Render

Pre-configured via `render.yaml`. Connect your repo and deploy.

### Any Server with Node.js

```bash
node src/server.js
# Listens on port 3000 by default
```

---

## 14. Customization

### Adjusting Timers & Limits

In `src/server.js`, update the config object served by `/api/config`:

| Setting | Default | Description |
|---------|---------|-------------|
| `questionTimeLimits.moderate` | 600 (10 min) | Timer for moderate questions |
| `questionTimeLimits.complex` | 900 (15 min) | Timer for complex questions |
| `tabSwitchFreezeLimit` | 3 | Max tab switches before freeze |
| `instructionReadTimer` | 120 (2 min) | Instruction page timer |

### Styling

Edit `public/styles.css`:
- Colors: CSS variables at top
- Fonts: body font-family
- Button styles, timer colors, responsive breakpoints

### Email Provider

Set `EMAIL_PROVIDER` in `.env`:
- `resend` — Resend API only
- `smtp` — SMTP only
- `auto` — Tries Resend first, falls back to SMTP, then console

---

## 15. Troubleshooting

| Problem | Solution |
|---------|----------|
| Server won't start | Ensure Node.js v12+ installed. Check port 3000 is free: `netstat -ano \| findstr :3000` |
| Java code won't execute | Install JDK (not JRE). Add to PATH. Test: `java -version` |
| Python code won't execute | Install Python 3.6+. Add to PATH. Test: `python --version` |
| OTP not sending | Check `.env` config. OTP always printed to server console as fallback |
| AI agent timeout | For Ollama: first call can take 160s (model loading). Check API keys for cloud providers |
| Session lost | Auto-saved every 30s. On reload, "Resume Assessment?" dialog appears. Expires after 2 hours |
| Port in use | Change `const PORT = 3000` in `src/server.js` |

---

## 16. Technology Stack

| Layer | Technology | Details |
|-------|-----------|---------|
| Backend | Node.js | v12+, built-in modules only (`http`, `https`, `fs`, `path`, `crypto`, `child_process`, `net`, `tls`) |
| Frontend | Vanilla JS + HTML5 + CSS3 | No frameworks, single-page app |
| Code Editor | CodeMirror 5 | Bundled in `public/lib/codemirror/` |
| Storage | File System | JSON + CSV in `results/` |
| Email | Custom SMTP + Resend API | TLS/STARTTLS support |
| AI | Cloud APIs + Local | Gemini, Claude, OpenAI, Ollama, Rule Engine |
| Code Execution | `child_process` | 5-second timeout, auto-cleanup |

### Project Statistics

| Metric | Value |
|--------|-------|
| Total Lines of Code | ~8,000+ |
| Backend (server.js) | ~3,400 LOC |
| Frontend (app.js) | ~3,700 LOC |
| API Routes | 17 |
| Programming Questions | 25 |
| Anti-Cheat Metrics | 13 |
| AI Providers | 4 + rule engine |
| Supported Languages | 3 (Java, Python, JavaScript) |
| npm Dependencies | 0 |

---

## 17. Security

| Feature | Implementation |
|---------|---------------|
| OTP Comparison | Constant-time via `crypto.timingSafeEqual` (prevents timing attacks) |
| Session Tokens | Cryptographically random (32 bytes) |
| Rate Limiting | 5 OTP requests per 10-minute window |
| OTP Expiry | 5 minutes |
| Max OTP Attempts | 3 per code |
| Copy/Paste Blocking | Configurable event interception |
| Code Execution Timeout | 5 seconds per run |
| Temp File Cleanup | Automatic after code execution |
| SMTP Security | TLS/STARTTLS support |
| Request Body Limit | 50 MB |

---

## License

MIT

---

**Built with pure Node.js — Zero npm dependencies required!**
