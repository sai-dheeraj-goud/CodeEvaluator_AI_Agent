# Simplified Admin/Panelist Dashboard

A clean, minimal admin interface for panelists to view candidate code, results, and summaries.

---

## UI Layout (Simple & Clean)

```
┌─────────────────────────────────────────────────┐
│  Code Evaluator - Admin Panel                   │
│  Welcome, Panelist | Logout                     │
├─────────────────────────────────────────────────┤
│                                                 │
│  Date Filter: [____/____/____] [Show]           │
│                                                 │
│  ┌──── TODAY'S SUMMARY ────────────────────┐   │
│  │ Total Candidates: 15                    │   │
│  │ Completed: 12 | In Progress: 2 | Skip: 1│   │
│  │ Average Score: 78%                      │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ┌──── CANDIDATES ATTENDED TODAY ───────────┐  │
│  │                                          │  │
│  │ 1. John Doe     | Score: 85% | View     │  │
│  │ 2. Jane Smith   | Score: 92% | View     │  │
│  │ 3. Mike Johnson | Score: 75% | View     │  │
│  │ 4. Sarah Lee    | Score: 88% | View     │  │
│  │                                          │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  ┌──── DOWNLOAD REPORTS ──────────────────┐   │
│  │ [Download Today's CSV] [Download PDF]  │   │
│  └────────────────────────────────────────┘   │
│                                                 │
└─────────────────────────────────────────────────┘

MODAL POPUP (When "View" clicked):
┌──────────────────────────────────────┐
│ John Doe - Results & Code            │
├──────────────────────────────────────┤
│                                      │
│ Q1: String Manipulation              │
│ Status: ✓ Correct | Score: 85%       │
│ Language: Java                       │
│ [VIEW CODE]                          │
│                                      │
│ Q2: Array Operations                 │
│ Status: ✓ Correct | Score: 92%       │
│ Language: Python                     │
│ [VIEW CODE]                          │
│                                      │
│ Q3: Database Query                   │
│ Status: ✗ Incorrect | Score: 65%     │
│ Language: JavaScript                 │
│ [VIEW CODE]                          │
│                                      │
│ Session Summary:                     │
│ Total Time: 45 min | Tab Switches: 3 │
│ Overall Score: 80%                   │
│                                      │
│         [Close] [Download Report]    │
└──────────────────────────────────────┘

CODE VIEWER (When [VIEW CODE] clicked):
┌──────────────────────────────────────┐
│ Q1: String Manipulation              │
├──────────────────────────────────────┤
│                                      │
│ SUBMITTED CODE:                      │
│ ┌────────────────────────────────┐  │
│ │ public class Solution {        │  │
│ │   public static void main() {  │  │
│ │     String s = "my is x";      │  │
│ │     System.out.println(...);   │  │
│ │   }                            │  │
│ │ }                              │  │
│ └────────────────────────────────┘  │
│                                      │
│ EXPECTED OUTPUT:                     │
│ my name is x                         │
│                                      │
│ ACTUAL OUTPUT:                       │
│ my name is x                         │
│                                      │
│ [Back] [Close]                       │
└──────────────────────────────────────┘
```

---

## File Structure (Simplified)

```
public/
  ├── panelist.html              (Main panelist dashboard)
  ├── panelist.js                (Dashboard logic)
  ├── panelist-styles.css        (Dashboard styling)
  └── panelist-modal.js          (Modal popup logic)

src/
  ├── server.js                  (Add 2 panelist endpoints)
  └── auth.js                    (NEW - JWT & password helpers)

data/
  ├── users.json                 (NEW - Users database)
  └── config.js                  (existing)
```

---

## Simple Backend (Only 2 Endpoints Needed)

### Endpoint 1: Get Day Summary & Candidate List

**GET `/api/panelist/daily-summary?date=2026-04-14`**

```javascript
Request: None (date in query param)
Authorization: Bearer {adminToken}

Response: {
  date: "2026-04-14",
  totalCandidates: 15,
  completed: 12,
  inProgress: 2,
  skipped: 1,
  averageScore: 78,
  candidates: [
    {
      id: "cand_001",
      name: "John Doe",
      email: "john@example.com",
      score: 85,
      status: "completed",
      sessionId: "sess_001",
      submittedAt: "2026-04-14T10:30:00Z"
    },
    {
      id: "cand_002",
      name: "Jane Smith",
      email: "jane@example.com",
      score: 92,
      status: "completed",
      sessionId: "sess_002",
      submittedAt: "2026-04-14T11:15:00Z"
    }
  ]
}
```

### Endpoint 2: Get Candidate Session Details

**GET `/api/panelist/candidate-session/:sessionId`**

```javascript
Request: None
Authorization: Bearer {adminToken}

Response: {
  sessionId: "sess_001",
  candidateId: "cand_001",
  candidateName: "John Doe",
  candidateEmail: "john@example.com",
  overallScore: 85,
  totalTime: "45 min",
  tabSwitches: 3,
  completionPercentage: 100,
  questions: [
    {
      questionId: 1,
      questionTitle: "String Manipulation",
      status: "correct",
      agentScore: 85,
      language: "java",
      timeTaken: "5 min",
      submittedCode: "public class Solution { ... }",
      expectedOutput: "my name is x",
      actualOutput: "my name is x"
    },
    {
      questionId: 2,
      questionTitle: "Array Operations",
      status: "correct",
      agentScore: 92,
      language: "python",
      timeTaken: "8 min",
      submittedCode: "def solution(): ...",
      expectedOutput: "[1, 2, 4, 3, 5]",
      actualOutput: "[1, 2, 4, 3, 5]"
    }
  ]
}
```

---

## Updated Login Flow (index.html - No Changes Needed)

Your existing login flow already handles OTP. Just modify it slightly:

```html
<!-- After successful OTP verification in index.html, add this role selection -->

<!-- ROLE SELECTION (Show after successful OTP) -->
<div id="roleSelectionModal" style="display: none;">
    <div class="modal-role-selection">
        <h2>Select Your Role</h2>
        <button onclick="goToCandidateDashboard()" class="role-btn candidate-btn">
            👨‍💻 Candidate<br/>
            <small>Take the test</small>
        </button>
        <button onclick="goToPanelistDashboard()" class="role-btn panelist-btn">
            📊 Admin/Panelist<br/>
            <small>View results & code</small>
        </button>
        <button onclick="logout()" class="role-btn logout-link">Logout</button>
    </div>
</div>

<!-- In app.js, after OTP verification: -->
<script>
// After successful OTP verification
document.getElementById('roleSelectionModal').style.display = 'flex';

function goToCandidateDashboard() {
    // Existing behavior - goes to candidate test page
    window.location.href = '/candidate-dashboard.html';
}

function goToPanelistDashboard() {
    // New - goes to panelist dashboard
    window.location.href = '/panelist.html';
}
</script>
```

---

## Simple Frontend (panelist.html)

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Panelist Dashboard</title>
    <link rel="stylesheet" href="panelist-styles.css">
</head>
<body>
    <!-- Check if user is logged in -->
    <script>
        const candidateId = localStorage.getItem('candidateId');
        const sessionId = localStorage.getItem('sessionId');
        if (!candidateId || !sessionId) {
            window.location.href = '/index.html';
        }
    </script>

    <div class="panelist-container">
        <!-- Header -->
        <header class="header">
            <div class="header-left">
                <h1>📊 Admin/Panelist Panel</h1>
            </div>
            <div class="header-right">
                <span id="userName">Welcome, Admin</span>
                <button onclick="logout()" class="logout-btn">Logout</button>
            </div>
        </header>

        <!-- Date Filter -->
        <div class="filter-section">
            <label for="dateFilter">Select Date:</label>
            <input type="date" id="dateFilter" />
            <button onclick="loadData()" class="btn-primary">Show</button>
            <button onclick="downloadCSV()" class="btn-secondary">📥 Download CSV</button>
            <button onclick="downloadPDF()" class="btn-secondary">📄 Download PDF</button>
        </div>

        <!-- Summary Cards -->
        <div class="summary-cards">
            <div class="card">
                <h3>Total Candidates</h3>
                <p id="totalCandidates" class="number">0</p>
            </div>
            <div class="card">
                <h3>Completed</h3>
                <p id="completedCount" class="number">0</p>
            </div>
            <div class="card">
                <h3>In Progress</h3>
                <p id="inProgressCount" class="number">0</p>
            </div>
            <div class="card">
                <h3>Average Score</h3>
                <p id="avgScore" class="number">0%</p>
            </div>
        </div>

        <!-- Candidates List -->
        <div class="candidates-section">
            <h2>Candidates Attended</h2>
            <table class="candidates-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Candidate Name</th>
                        <th>Email</th>
                        <th>Score</th>
                        <th>Status</th>
                        <th>Submitted At</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody id="candidatesBody">
                    <tr>
                        <td colspan="7" style="text-align: center; padding: 20px;">
                            Loading candidates...
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>

    <!-- Modal for Results & Code -->
    <div id="resultModal" class="modal" style="display: none;">
        <div class="modal-content">
            <div class="modal-header">
                <h2 id="modalTitle">Candidate Results</h2>
                <span class="close" onclick="closeModal()">&times;</span>
            </div>
            <div class="modal-body">
                <!-- Summary -->
                <div class="session-summary">
                    <p><strong>Overall Score:</strong> <span id="modalScore">0%</span></p>
                    <p><strong>Total Time:</strong> <span id="modalTime">0 min</span></p>
                    <p><strong>Tab Switches:</strong> <span id="modalTabSwitches">0</span></p>
                    <p><strong>Completion:</strong> <span id="modalCompletion">0%</span></p>
                </div>

                <!-- Questions -->
                <div id="questionsContainer"></div>
            </div>
            <div class="modal-footer">
                <button onclick="closeModal()" class="btn-secondary">Close</button>
                <button onclick="downloadSessionReport()" class="btn-primary">Download Report</button>
            </div>
        </div>
    </div>

    <!-- Modal for Code Viewer -->
    <div id="codeModal" class="modal" style="display: none;">
        <div class="modal-content code-modal-content">
            <div class="modal-header">
                <h2 id="codeModalTitle">Code Viewer</h2>
                <span class="close" onclick="closeCodeModal()">&times;</span>
            </div>
            <div class="modal-body">
                <div class="code-section">
                    <h3>Submitted Code</h3>
                    <pre id="submittedCodeBlock"><code id="submittedCode"></code></pre>
                </div>
                <div class="output-comparison">
                    <div class="output-section">
                        <h3>Expected Output</h3>
                        <pre id="expectedOutputBlock"><code id="expectedOutput"></code></pre>
                    </div>
                    <div class="output-section">
                        <h3>Actual Output</h3>
                        <pre id="actualOutputBlock"><code id="actualOutput"></code></pre>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button onclick="closeCodeModal()" class="btn-secondary">Back</button>
            </div>
        </div>
    </div>

    <script src="panelist.js"></script>
</body>
</html>
```

---

## Simple Frontend JavaScript (panelist.js)

```javascript
let currentSessionData = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Check if user is logged in (using existing login session)
    const candidateId = localStorage.getItem('candidateId');
    const sessionId = localStorage.getItem('sessionId');
    
    if (!candidateId || !sessionId) {
        window.location.href = '/index.html'; // Redirect to login
    }
    
    // Show candidate name if available
    const candidateName = localStorage.getItem('candidateName') || 'Admin';
    document.getElementById('userName').textContent = 'Welcome, ' + candidateName;
    
    // Set today's date as default
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('dateFilter').value = today;
    
    loadData();
});

// Load daily summary & candidates
async function loadData() {
    const date = document.getElementById('dateFilter').value;
    
    try {
        const response = await fetch(`/api/panelist/daily-summary?date=${date}`);
        
        if (!response.ok) throw new Error('Failed to load data');
        
        const data = await response.json();
        
        // Update summary cards
        document.getElementById('totalCandidates').textContent = data.totalCandidates;
        document.getElementById('completedCount').textContent = data.completed;
        document.getElementById('inProgressCount').textContent = data.inProgress;
        document.getElementById('avgScore').textContent = data.averageScore + '%';
        
        // Update candidates table
        const tbody = document.getElementById('candidatesBody');
        if (data.candidates.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px;">No candidates attended on this date</td></tr>';
            return;
        }
        
        tbody.innerHTML = data.candidates.map((c, idx) => `
            <tr>
                <td>${idx + 1}</td>
                <td><strong>${c.name}</strong></td>
                <td>${c.email}</td>
                <td><span class="score ${c.score >= 75 ? 'high' : c.score >= 50 ? 'medium' : 'low'}">${c.score}%</span></td>
                <td><span class="status-${c.status}">${c.status}</span></td>
                <td>${new Date(c.submittedAt).toLocaleString()}</td>
                <td>
                    <button onclick="viewResults('${c.sessionId}')" class="btn-view">View Code & Results</button>
                </td>
            </tr>
        `).join('');
        
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

// View candidate results & code
async function viewResults(sessionId) {
    try {
        const response = await fetch(`/api/panelist/candidate-session/${sessionId}`);
        
        if (!response.ok) throw new Error('Failed to load session details');
        
        const data = await response.json();
        currentSessionData = data;
        
        // Update modal header
        document.getElementById('modalTitle').textContent = data.candidateName + ' - Results & Code';
        
        // Update summary
        document.getElementById('modalScore').textContent = data.overallScore + '%';
        document.getElementById('modalTime').textContent = data.totalTime;
        document.getElementById('modalTabSwitches').textContent = data.tabSwitches;
        document.getElementById('modalCompletion').textContent = data.completionPercentage + '%';
        
        // Update questions
        const questionsContainer = document.getElementById('questionsContainer');
        questionsContainer.innerHTML = data.questions.map(q => `
            <div class="question-item">
                <div class="question-header">
                    <h3>Q${q.questionId}: ${q.questionTitle}</h3>
                    <span class="score ${q.status === 'correct' ? 'correct' : 'incorrect'}">
                        ${q.status === 'correct' ? '✓' : '✗'} ${q.agentScore}%
                    </span>
                </div>
                <div class="question-info">
                    <p><strong>Language:</strong> ${q.language}</p>
                    <p><strong>Time Taken:</strong> ${q.timeTaken}</p>
                </div>
                <button onclick="viewCode(${q.questionId})" class="btn-view-code">View Code</button>
            </div>
        `).join('');
        
        // Show modal
        document.getElementById('resultModal').style.display = 'block';
        
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

// View code for a question
function viewCode(questionId) {
    const question = currentSessionData.questions.find(q => q.questionId === questionId);
    
    document.getElementById('codeModalTitle').textContent = `Q${questionId}: ${question.questionTitle}`;
    document.getElementById('submittedCode').textContent = question.submittedCode;
    document.getElementById('expectedOutput').textContent = question.expectedOutput;
    document.getElementById('actualOutput').textContent = question.actualOutput;
    
    // Hide result modal, show code modal
    document.getElementById('resultModal').style.display = 'none';
    document.getElementById('codeModal').style.display = 'block';
}

// Download CSV
async function downloadCSV() {
    const date = document.getElementById('dateFilter').value;
    window.location.href = `/api/panelist/export-csv?date=${date}`;
}

// Download PDF
async function downloadPDF() {
    const date = document.getElementById('dateFilter').value;
    window.location.href = `/api/panelist/export-pdf?date=${date}`;
}

// Close modals
function closeModal() {
    document.getElementById('resultModal').style.display = 'none';
}

function closeCodeModal() {
    document.getElementById('codeModal').style.display = 'none';
    document.getElementById('resultModal').style.display = 'block';
}

// Logout
function logout() {
    localStorage.removeItem('candidateId');
    localStorage.removeItem('sessionId');
    localStorage.removeItem('candidateName');
    localStorage.removeItem('testStartTime');
    window.location.href = '/index.html';
}

// Download session report
function downloadSessionReport() {
    // Create CSV from currentSessionData
    const csv = generateSessionCSV(currentSessionData);
    downloadFile(csv, `${currentSessionData.candidateName}-report.csv`, 'text/csv');
}

function generateSessionCSV(session) {
    let csv = 'Question,Status,Score,Language,Time Taken\n';
    session.questions.forEach(q => {
        csv += `"${q.questionTitle}","${q.status}","${q.agentScore}%","${q.language}","${q.timeTaken}"\n`;
    });
    csv += `\n\nSession Summary\n`;
    csv += `Overall Score,${session.overallScore}%\n`;
    csv += `Total Time,${session.totalTime}\n`;
    csv += `Tab Switches,${session.tabSwitches}\n`;
    csv += `Completion,${session.completionPercentage}%\n`;
    return csv;
}

function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
}
```

---

## Simple CSS (panelist-styles.css)

```css
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    min-height: 100vh;
    padding: 20px;
}

.panelist-container {
    max-width: 1400px;
    margin: 0 auto;
    background: white;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
    overflow: hidden;
}

/* Header */
.header {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 20px 30px;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.header h1 {
    font-size: 28px;
}

.header-right {
    display: flex;
    gap: 20px;
    align-items: center;
}

.logout-btn {
    background: white;
    color: #667eea;
    border: none;
    padding: 8px 20px;
    border-radius: 6px;
    cursor: pointer;
    font-weight: bold;
    transition: 0.3s;
}

.logout-btn:hover {
    transform: scale(1.05);
}

/* Filter Section */
.filter-section {
    padding: 20px 30px;
    background: #f8f9fa;
    border-bottom: 1px solid #e0e0e0;
    display: flex;
    gap: 15px;
    align-items: center;
    flex-wrap: wrap;
}

.filter-section label {
    font-weight: 600;
    color: #333;
}

.filter-section input[type="date"] {
    padding: 10px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 14px;
}

/* Buttons */
.btn-primary, .btn-secondary {
    padding: 10px 20px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 600;
    transition: 0.3s;
}

.btn-primary {
    background: #667eea;
    color: white;
}

.btn-primary:hover {
    background: #5568d3;
}

.btn-secondary {
    background: #e0e0e0;
    color: #333;
}

.btn-secondary:hover {
    background: #c0c0c0;
}

.btn-view {
    background: #4CAF50;
    color: white;
    padding: 6px 12px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
}

.btn-view:hover {
    background: #45a049;
}

.btn-view-code {
    background: #2196F3;
    color: white;
    padding: 8px 16px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    margin-top: 10px;
}

.btn-view-code:hover {
    background: #0b7dda;
}

/* Summary Cards */
.summary-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
    padding: 30px;
    background: #f8f9fa;
}

.card {
    background: white;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    text-align: center;
}

.card h3 {
    color: #666;
    font-size: 14px;
    margin-bottom: 10px;
}

.card .number {
    font-size: 32px;
    font-weight: bold;
    color: #667eea;
}

/* Candidates Section */
.candidates-section {
    padding: 30px;
}

.candidates-section h2 {
    margin-bottom: 20px;
    color: #333;
}

.candidates-table {
    width: 100%;
    border-collapse: collapse;
    background: white;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    border-radius: 8px;
    overflow: hidden;
}

.candidates-table thead {
    background: #667eea;
    color: white;
}

.candidates-table th, .candidates-table td {
    padding: 15px;
    text-align: left;
    border-bottom: 1px solid #e0e0e0;
}

.candidates-table tbody tr:hover {
    background: #f5f5f5;
}

.score {
    padding: 4px 8px;
    border-radius: 4px;
    font-weight: bold;
}

.score.high {
    background: #d4edda;
    color: #155724;
}

.score.medium {
    background: #fff3cd;
    color: #856404;
}

.score.low {
    background: #f8d7da;
    color: #721c24;
}

.status-completed {
    background: #d4edda;
    color: #155724;
    padding: 4px 8px;
    border-radius: 4px;
}

.status-inProgress {
    background: #fff3cd;
    color: #856404;
    padding: 4px 8px;
    border-radius: 4px;
}

/* Modal */
.modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
    overflow-y: auto;
}

.modal-content {
    background: white;
    border-radius: 12px;
    width: 90%;
    max-width: 900px;
    max-height: 90vh;
    overflow-y: auto;
    margin: 20px auto;
}

.code-modal-content {
    max-width: 1000px;
}

.modal-header {
    padding: 20px 30px;
    border-bottom: 1px solid #e0e0e0;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.modal-header h2 {
    color: #333;
}

.close {
    font-size: 28px;
    cursor: pointer;
    color: #999;
}

.close:hover {
    color: #000;
}

.modal-body {
    padding: 30px;
}

.session-summary {
    background: #f8f9fa;
    padding: 20px;
    border-radius: 8px;
    margin-bottom: 20px;
}

.session-summary p {
    margin: 8px 0;
    color: #333;
}

/* Question Items */
.question-item {
    background: #f8f9fa;
    padding: 20px;
    border-radius: 8px;
    margin-bottom: 15px;
    border-left: 4px solid #667eea;
}

.question-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
}

.question-header h3 {
    color: #333;
    margin: 0;
}

.question-header .score {
    font-weight: bold;
    padding: 4px 8px;
    border-radius: 4px;
}

.question-header .score.correct {
    background: #d4edda;
    color: #155724;
}

.question-header .score.incorrect {
    background: #f8d7da;
    color: #721c24;
}

.question-info p {
    margin: 5px 0;
    color: #666;
    font-size: 14px;
}

/* Code Viewer */
.code-section, .output-section {
    margin-bottom: 20px;
}

.code-section h3, .output-section h3 {
    color: #333;
    margin-bottom: 10px;
}

pre {
    background: #f4f4f4;
    padding: 15px;
    border-radius: 6px;
    overflow-x: auto;
    border: 1px solid #ddd;
}

code {
    font-family: 'Courier New', monospace;
    font-size: 13px;
    color: #333;
}

.output-comparison {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
}

/* Modal Footer */
.modal-footer {
    padding: 20px 30px;
    border-top: 1px solid #e0e0e0;
    display: flex;
    justify-content: flex-end;
    gap: 10px;
}

/* Responsive */
@media (max-width: 768px) {
    .filter-section {
        flex-direction: column;
        align-items: stretch;
    }
    
    .summary-cards {
        grid-template-columns: 1fr 1fr;
    }
    
    .output-comparison {
        grid-template-columns: 1fr;
    }
    
    .candidates-table {
        font-size: 14px;
    }
    
    .candidates-table th, .candidates-table td {
        padding: 10px;
    }
}

/* Role Selection Modal */
#roleSelectionModal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 2000;
}

.modal-role-selection {
    background: white;
    padding: 50px;
    border-radius: 16px;
    text-align: center;
    max-width: 500px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.modal-role-selection h2 {
    font-size: 28px;
    color: #333;
    margin-bottom: 40px;
}

.role-btn {
    display: block;
    width: 100%;
    padding: 25px;
    margin: 15px 0;
    border: none;
    border-radius: 10px;
    font-size: 18px;
    font-weight: bold;
    cursor: pointer;
    transition: 0.3s;
}

.role-btn small {
    display: block;
    font-size: 13px;
    margin-top: 5px;
    opacity: 0.8;
}

.candidate-btn {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
}

.candidate-btn:hover {
    transform: translateY(-3px);
    box-shadow: 0 10px 25px rgba(102, 126, 234, 0.4);
}

.panelist-btn {
    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
    color: white;
}

.panelist-btn:hover {
    transform: translateY(-3px);
    box-shadow: 0 10px 25px rgba(245, 87, 108, 0.4);
}

.logout-link {
    background: #e0e0e0;
    color: #333;
    margin-top: 30px;
}

.logout-link:hover {
    background: #c0c0c0;
}
```

---

## Backend Integration (Add to src/server.js)

```javascript
// Add these endpoints to your server.js

// GET /api/panelist/daily-summary
if (pathname === '/api/panelist/daily-summary' && req.method === 'GET') {
    // Check authentication first
    const date = new URL(req.url, 'http://localhost').searchParams.get('date');
    
    // Read results files for the given date
    // Filter results where submittedAt matches the date
    // Return summary and candidates list
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        date,
        totalCandidates: 15,
        completed: 12,
        inProgress: 2,
        skipped: 1,
        averageScore: 78,
        candidates: [
            // Return array of candidates for that date
        ]
    }));
    return;
}

// GET /api/panelist/candidate-session/:sessionId
if (pathname.match(/^\/api\/panelist\/candidate-session\/[^/]+$/) && req.method === 'GET') {
    const sessionId = pathname.split('/').pop();
    
    // Find session in results
    // Return detailed session with all questions
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        sessionId,
        candidateId: 'cand_001',
        candidateName: 'John Doe',
        candidateEmail: 'john@example.com',
        overallScore: 85,
        totalTime: '45 min',
        tabSwitches: 3,
        completionPercentage: 100,
        questions: [
            // Return array of questions with code
        ]
    }));
    return;
}
```

---

## Summary: What Makes This Simple

✅ **Only 2 Backend Endpoints** (vs 5-6 in complex version)
✅ **Single Clean Dashboard** (no multiple tabs/sections)
✅ **One-Click Access** to candidate code & results
✅ **Date-Based Filtering** (see who attended today)
✅ **Modal Popups** (clean, distraction-free viewing)
✅ **Basic CSV Export** (for further analysis)
✅ **Minimal UI** (easy to navigate, professional look)

---

## Files to Create

1. `public/panelist.html` - Main dashboard
2. `public/panelist.js` - Logic
3. `public/panelist-styles.css` - Styling
4. `src/auth.js` - JWT helper
5. `data/users.json` - Users database
6. `public/login.html` - Login page (reuse from earlier guide)

---

Would you like me to:
1. **Start implementing these files**?
2. **Create just the HTML & CSS first** (for styling)?
3. **Show how to add the backend endpoints** to server.js?
