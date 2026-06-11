# New Laptop Setup Guide

A one-page guide to getting Code Evaluator AI Agent running on a brand-new machine — even one with no Node.js, Java, or Python installed.

---

## What you'll end up with

After ~15 minutes:
- All three runtimes (Node.js, Java, Python) downloaded into the project folder — **no system install, no admin rights, no PATH changes**
- CodeMirror editor bundled locally
- Server running on `http://localhost:3000`

Total disk usage: ~250 MB inside the project folder. Delete the folder and everything goes with it.

---

## Prerequisites

The new machine needs only:

- **Internet connection** (to download runtimes — one-time, ~250 MB)
- **~500 MB free disk space** (downloads + extracts)
- **PowerShell** on Windows (built into Win 7 and later) — **or** **`curl`/`wget`** on Linux/Mac (almost always pre-installed)

That's it. No Node, no Java, no Python, no admin rights required.

---

## Step-by-step: Windows

```cmd
:: 1. Copy the project to the laptop (USB stick, OneDrive, git clone, zip — any way)
cd C:\path\to\CodeEvaluator_AI_Agent

:: 2. Download all three runtimes + CodeMirror (one command)
setup-runtimes.bat

:: 3. Configure secrets
copy .env.example .env
notepad .env
::    Fill in at minimum:
::      GMAIL_SMTP_USER=your-gmail@gmail.com
::      GMAIL_SMTP_PASS=your-app-password  (NOT your regular Gmail password — see below)
::      GMAIL_SMTP_FROM=your-gmail@gmail.com
::    Optional but recommended:
::      One AI key (GEMINI_API_KEYS or CLAUDE_API_KEY or OPENAI_API_KEY)

:: 4. (Optional) edit roster
notepad data\candidate-emails.csv
notepad data\panelist-emails.csv

:: 5. Start the server
start.bat
```

Open `http://localhost:3000` in a browser.

---

## Step-by-step: Linux / macOS

```bash
# 1. Copy the project to the machine
cd ~/CodeEvaluator_AI_Agent
chmod +x setup-runtimes.sh start.sh

# 2. Download all three runtimes + CodeMirror
./setup-runtimes.sh

# 3. Configure secrets
cp .env.example .env
nano .env
#    Fill in at minimum:
#      GMAIL_SMTP_USER=your-gmail@gmail.com
#      GMAIL_SMTP_PASS=your-app-password
#      GMAIL_SMTP_FROM=your-gmail@gmail.com

# 4. (Optional) edit roster
nano data/candidate-emails.csv
nano data/panelist-emails.csv

# 5. Start
./start.sh
```

Open `http://localhost:3000` in a browser.

---

## Gmail App Password — the step everyone misses

Gmail SMTP **does not accept** your regular Gmail password. You need a 16-character "App Password" generated specifically for SMTP.

**How to get one:**

1. The Gmail account must have **2-Factor Authentication enabled** first. Without 2FA, the App Password option doesn't appear.
   - Enable at <https://myaccount.google.com/security>
2. Go to <https://myaccount.google.com/apppasswords>
3. Generate a password named e.g. "CodeEvaluator SMTP"
4. Copy the 16-character password (Google shows it once)
5. Paste it into `.env` as `GMAIL_SMTP_PASS` — **with no spaces**

If you skip this, OTP emails will never send and login will silently fail.

---

## Verify the install worked

After `setup-runtimes`, these files should exist:

| Windows | Linux/Mac |
|---|---|
| `runtimes\node\node.exe` | `runtimes/node/bin/node` |
| `runtimes\java\bin\java.exe` | `runtimes/java/bin/java` |
| `runtimes\python\python.exe` | `runtimes/python/bin/python3` |
| `public\lib\codemirror\codemirror.min.js` | `public/lib/codemirror/codemirror.min.js` |

After `start.bat` / `start.sh`, you should see:
```
Using portable Node.js: ...
Java: portable [runtimes/java]
Python: portable [runtimes/python]
Starting Code Evaluator AI Agent...
Open browser: http://localhost:3000
```

**End-to-end smoke test:**
1. Open `http://localhost:3000` — login page should load
2. Enter a panelist email (one from `data/panelist-emails.csv`)
3. OTP should arrive in that inbox within 30 seconds → SMTP works
4. Verify the OTP → reach the panel dashboard → session works
5. Click "Take Test" with a candidate email → run a Java problem end-to-end
6. Submit → check the panelist dashboard shows the result

If steps 1–2 work but the OTP never arrives, it's almost always a Gmail App Password issue. Check spam folder too.

---

## Common issues & fixes

### "Failed to download Node.js / JDK / Python"
**Cause:** corporate firewall, proxy, or rate limit blocking `nodejs.org`, `download.java.net`, `github.com`, or `cdnjs.cloudflare.com`.

**Fixes:**
- Set proxy environment variables before running setup:
  - Windows: `set HTTP_PROXY=http://proxy.example.com:8080` then `set HTTPS_PROXY=http://proxy.example.com:8080`
  - Linux/Mac: `export HTTP_PROXY=...` / `export HTTPS_PROXY=...`
- Or manually download the four archives on a connected machine and place them in `runtimes/downloads/` before running setup — the script will detect them and skip the download step.
- Or run setup on an unrestricted machine, then copy the **entire project folder including `runtimes/` and `public/lib/`** to the target machine.

### "PowerShell execution policy" error on Windows
**Cause:** locked-down corporate Windows.

**Fix (run once from an Administrator PowerShell):**
```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

### Antivirus quarantines `node.exe` or `java.exe`
**Symptom:** setup says success, but `start.bat` immediately reports "Node not found."

**Fix:** open your antivirus quarantine list (McAfee, Symantec, Defender) and restore the files. Add the `runtimes\` folder to the AV exclusion list.

### Setup completed but the summary shows `✗` marks
**Important:** the setup script does **not** exit with an error code on partial failure. Always read the summary at the end. If anything shows `✗`:
- Re-run `setup-runtimes` — it will skip already-installed components and retry failed ones
- Or check the messages above the summary for the specific download/extraction error

### Port 3000 already in use
**Fix:** edit `.env` and set `PORT=3001` (or any free port), then restart.

### "Cannot find module" or "process exited" on first run
**Fix:** delete `.server.lock` if present (stale lock from a previous crashed run), then start again.

### Server runs but candidate login fails
**Causes (in order of frequency):**
1. `.env` not edited — still has placeholder values
2. Gmail App Password wrong (used regular password instead)
3. Candidate's email not in `data/candidate-emails.csv`
4. Candidate already logged in once (each candidate is one-shot by design — clear the "submitted candidates" state if testing)

### Air-gapped (no internet) machine
The setup script needs internet to download. **Workaround:** run setup on a connected machine first, then copy the whole project folder (including `runtimes/` and `public/lib/`) to the air-gapped machine. The server itself only needs internet for SMTP (OTP delivery) and AI scoring — neither will work air-gapped, so plan for that.

---

## What's running on what machine

After setup, the entire stack runs on the laptop locally. The only outbound connections during normal use are:

| What | Where it goes | Required? |
|---|---|---|
| OTP delivery | Gmail SMTP (or Office 365) | Yes — login won't work without it |
| AI scoring | Anthropic / Gemini / OpenAI API | Optional — falls back to rule-based |
| Candidate browser → server | Local (same machine, port 3000) | Yes |

If you want candidates on **different machines** to access this laptop, you'll need:
- Firewall rule to allow inbound TCP on port 3000
- The laptop's IP address (find with `ipconfig` on Windows or `ifconfig`/`ip a` on Linux/Mac)
- Candidates open `http://<laptop-ip>:3000` in their browsers
- The laptop and candidates must be on the same network (Wi-Fi/LAN)

---

## Re-running setup

`setup-runtimes` is idempotent — re-running it skips anything already installed and only retries what failed. Safe to re-run any time. If you want to force a clean reinstall, delete the `runtimes/` and `public/lib/` folders first.

---

## Uninstall

To completely remove the project and everything it installed:

```
delete the project folder
```

That's it. No registry entries, no system files, no leftover services. Everything was self-contained.

---

## Quick reference

| Task | Windows | Linux/Mac |
|---|---|---|
| Install runtimes | `setup-runtimes.bat` | `./setup-runtimes.sh` |
| Start server | `start.bat` | `./start.sh` |
| Stop server | `Ctrl+C` in the terminal | `Ctrl+C` in the terminal |
| Edit secrets | `notepad .env` | `nano .env` |
| Edit rosters | `data\candidate-emails.csv`, `data\panelist-emails.csv` | `data/candidate-emails.csv`, `data/panelist-emails.csv` |
| Edit questions | `data\questions.json` (or via panel UI) | `data/questions.json` (or via panel UI) |
| Edit config | `data\config.js` | `data/config.js` |
| Tail logs | `type logs\server.log` | `tail -f logs/server.log` |
| Clear stale lock | delete `.server.lock` | `rm .server.lock` |

---

## Need help?

1. Check `logs/server.log` first — most failures are logged with a clear error
2. Check the in-app log viewer: `GET http://localhost:3000/api/logs?lines=200`
3. The `README.md` has full feature documentation
