# Admin/Panelist Dashboard Implementation Guide

## Overview
Add a role-based access system where users can login as either:
1. **Candidate** - Takes the coding assessment
2. **Panelist/Admin** - Views candidate performance, scores, code, and results

---

## Phase 1: Database Schema (Data Layer)

### 1.1 Create User Roles Table
Add to `data/users.json` (or database):
```json
{
  "users": [
    {
      "id": "user_001",
      "email": "panelist@example.com",
      "password": "hashed_password",
      "role": "admin",
      "name": "John Panelist",
      "createdAt": "2026-04-14T00:00:00Z"
    },
    {
      "id": "user_002",
      "email": "candidate@example.com",
      "password": "hashed_password",
      "role": "candidate",
      "name": "Jane Candidate",
      "createdAt": "2026-04-14T00:00:00Z"
    }
  ]
}
```

### 1.2 Extend Session/Auth Storage
Modify `data/config.js` to include:
```javascript
// Add to config.js
adminEmails: ['admin@company.com', 'panelist@company.com'], // Pre-approved admins
sessionTimeout: 3600000, // 1 hour in milliseconds
enableAdminDashboard: true
```

### 1.3 Modify Results Storage
Enhance result objects with:
```javascript
{
  candidateId: "user_123",
  candidateEmail: "candidate@example.com",
  candidateName: "Jane Doe",
  sessionId: "session_abc123",
  role: "candidate",
  questionAttempts: [
    {
      questionId: 1,
      submittedCode: "...",
      agentScore: 85,
      language: "java",
      executionTime: "1min 30sec",
      status: "Correct",
      timestamp: "2026-04-14T10:30:00Z"
    }
  ],
  sessionMetrics: {
    totalTime: "15min 45sec",
    tabSwitches: 3,
    completionPercentage: 100,
    averageScore: 82
  },
  createdAt: "2026-04-14T10:15:00Z",
  updatedAt: "2026-04-14T10:45:00Z"
}
```

---

## Phase 2: Backend API Endpoints (Server Layer)

### 2.1 Authentication Endpoints

**POST /api/auth/login**
```javascript
Request: {
  email: "user@example.com",
  password: "password"
}

Response: {
  success: true,
  authToken: "jwt_token_here",
  role: "admin|candidate",
  userId: "user_id",
  userName: "John Doe",
  redirectTo: "/admin-dashboard" // or "/assessment"
}
```

**POST /api/auth/logout**
```javascript
Response: {
  success: true,
  message: "Logged out successfully"
}
```

**GET /api/auth/validate-token**
```javascript
Response: {
  valid: true,
  role: "admin|candidate",
  userId: "user_id"
}
```

### 2.2 Admin-Only Endpoints

**GET /api/admin/candidates**
```javascript
Response: {
  candidates: [
    {
      id: "user_001",
      name: "Jane Doe",
      email: "jane@example.com",
      experienceYears: 3,
      sessionCount: 5,
      averageScore: 78,
      lastAttempt: "2026-04-14T10:30:00Z",
      status: "completed|in-progress|pending"
    }
  ]
}
```

**GET /api/admin/candidate/:candidateId**
```javascript
Response: {
  candidate: {
    id: "user_001",
    name: "Jane Doe",
    email: "jane@example.com",
    experienceYears: 3,
    allAttempts: [
      {
        sessionId: "session_001",
        startTime: "2026-04-14T10:00:00Z",
        endTime: "2026-04-14T10:45:00Z",
        completionPercentage: 100,
        averageScore: 82,
        tabSwitches: 3,
        questions: [
          {
            questionId: 1,
            title: "String Manipulation",
            status: "Correct",
            score: 85,
            language: "java"
          }
        ]
      }
    ]
  }
}
```

**GET /api/admin/session/:sessionId**
```javascript
Response: {
  session: {
    candidateId: "user_001",
    candidateName: "Jane Doe",
    startTime: "2026-04-14T10:00:00Z",
    endTime: "2026-04-14T10:45:00Z",
    questions: [
      {
        questionId: 1,
        title: "String Manipulation",
        submittedCode: "public class Solution { ... }",
        language: "java",
        status: "Correct",
        agentScore: 85,
        expectedOutput: "my name is x",
        actualOutput: "my name is x",
        timeTaken: "1min 30sec",
        codeCharacterCount: 495
      }
    ],
    metrics: {
      totalTime: "45min",
      tabSwitches: 3,
      completionPercentage: 100,
      averageScore: 82
    }
  }
}
```

**GET /api/admin/analytics**
```javascript
Response: {
  totalCandidates: 50,
  activeSessions: 5,
  completedAssessments: 45,
  averageScore: 76,
  scoreDistribution: {
    "0-20": 2,
    "20-40": 5,
    "40-60": 15,
    "60-80": 18,
    "80-100": 10
  },
  questionDifficulty: {
    moderate: {
      attempted: 200,
      correctRate: 75
    },
    complex: {
      attempted: 100,
      correctRate: 45
    }
  }
}
```

**GET /api/admin/reports/export**
```javascript
// Export as CSV/PDF
Response: CSV or PDF file with all candidate data
```

### 2.3 Protect Endpoints with Middleware

Add authentication middleware in `src/server.js`:
```javascript
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Access token required' }));
    }
    
    // Verify JWT token
    try {
        const decoded = verifyToken(token);
        req.user = decoded;
        next();
    } catch (err) {
        return res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid token' }));
    }
}

function authorizeAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Admin access required' }));
    }
    next();
}
```

---

## Phase 3: Frontend UI Implementation

### 3.1 Login/Role Selection Screen
**File:** `public/login.html`

```html
<!DOCTYPE html>
<html>
<head>
    <title>CodeEvaluator - Login</title>
    <link rel="stylesheet" href="login-styles.css">
</head>
<body>
    <div class="login-container">
        <div class="login-card">
            <h1>Code Evaluator AI Agent</h1>
            <form id="loginForm">
                <input type="email" id="email" placeholder="Email" required>
                <input type="password" id="password" placeholder="Password" required>
                <button type="submit">Login</button>
            </form>
            <div id="errorMessage" style="color: red;"></div>
        </div>
    </div>
    <script>
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            
            const data = await response.json();
            if (data.success) {
                localStorage.setItem('authToken', data.authToken);
                localStorage.setItem('userRole', data.role);
                window.location.href = data.redirectTo;
            } else {
                document.getElementById('errorMessage').textContent = data.error;
            }
        });
    </script>
</body>
</html>
```

### 3.2 Admin Dashboard
**File:** `public/admin-dashboard.html`

```html
<!DOCTYPE html>
<html>
<head>
    <title>Admin Dashboard</title>
    <link rel="stylesheet" href="admin-dashboard-styles.css">
</head>
<body>
    <div class="admin-container">
        <nav class="sidebar">
            <h2>Admin Panel</h2>
            <ul>
                <li><a href="#overview">Dashboard Overview</a></li>
                <li><a href="#candidates">Candidates</a></li>
                <li><a href="#analytics">Analytics</a></li>
                <li><a href="#reports">Reports</a></li>
                <li><a href="#settings">Settings</a></li>
                <li><a href="#" onclick="logout()">Logout</a></li>
            </ul>
        </nav>
        
        <main class="content">
            <!-- Dashboard Overview Section -->
            <section id="overview" class="dashboard-section">
                <h2>Dashboard Overview</h2>
                <div class="metrics-grid">
                    <div class="metric-card">
                        <h3>Total Candidates</h3>
                        <p id="totalCandidates" class="metric-value">0</p>
                    </div>
                    <div class="metric-card">
                        <h3>Active Sessions</h3>
                        <p id="activeSessions" class="metric-value">0</p>
                    </div>
                    <div class="metric-card">
                        <h3>Completed Assessments</h3>
                        <p id="completedAssessments" class="metric-value">0</p>
                    </div>
                    <div class="metric-card">
                        <h3>Average Score</h3>
                        <p id="averageScore" class="metric-value">0%</p>
                    </div>
                </div>
            </section>
            
            <!-- Candidates List Section -->
            <section id="candidates" class="dashboard-section">
                <h2>Candidates</h2>
                <table id="candidatesTable">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Experience</th>
                            <th>Sessions</th>
                            <th>Avg Score</th>
                            <th>Last Attempt</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody id="candidatesBody">
                    </tbody>
                </table>
            </section>
            
            <!-- Candidate Detail View -->
            <section id="candidateDetail" class="dashboard-section" style="display:none;">
                <h2 id="candidateName"></h2>
                <div class="candidate-info">
                    <p><strong>Email:</strong> <span id="candidateEmail"></span></p>
                    <p><strong>Experience:</strong> <span id="candidateExp"></span> years</p>
                </div>
                
                <h3>Assessment History</h3>
                <table id="assessmentTable">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Score</th>
                            <th>Time Taken</th>
                            <th>Completion %</th>
                            <th>View Details</th>
                        </tr>
                    </thead>
                    <tbody id="assessmentBody">
                    </tbody>
                </table>
            </section>
            
            <!-- Session Details View -->
            <section id="sessionDetail" class="dashboard-section" style="display:none;">
                <h2>Session Details</h2>
                <div class="session-metrics">
                    <p><strong>Candidate:</strong> <span id="sessionCandidate"></span></p>
                    <p><strong>Duration:</strong> <span id="sessionDuration"></span></p>
                    <p><strong>Average Score:</strong> <span id="sessionAvgScore"></span></p>
                    <p><strong>Tab Switches:</strong> <span id="sessionTabSwitches"></span></p>
                </div>
                
                <h3>Question Breakdown</h3>
                <div id="questionsBreakdown"></div>
            </section>
        </main>
    </div>
    
    <script src="admin-dashboard.js"></script>
</body>
</html>
```

**File:** `public/admin-dashboard.js`

```javascript
let authToken = localStorage.getItem('authToken');

async function loadDashboard() {
    // Validate token
    const tokenValid = await validateToken();
    if (!tokenValid) {
        window.location.href = '/login.html';
        return;
    }
    
    // Load analytics
    const analyticsRes = await fetch('/api/admin/analytics', {
        headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const analytics = await analyticsRes.json();
    
    document.getElementById('totalCandidates').textContent = analytics.totalCandidates;
    document.getElementById('activeSessions').textContent = analytics.activeSessions;
    document.getElementById('completedAssessments').textContent = analytics.completedAssessments;
    document.getElementById('averageScore').textContent = analytics.averageScore + '%';
    
    // Load candidates
    loadCandidates();
}

async function loadCandidates() {
    const res = await fetch('/api/admin/candidates', {
        headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    
    const tbody = document.getElementById('candidatesBody');
    tbody.innerHTML = data.candidates.map(c => `
        <tr>
            <td>${c.name}</td>
            <td>${c.email}</td>
            <td>${c.experienceYears} yrs</td>
            <td>${c.sessionCount}</td>
            <td>${c.averageScore}%</td>
            <td>${new Date(c.lastAttempt).toLocaleDateString()}</td>
            <td><span class="status-${c.status}">${c.status}</span></td>
            <td>
                <button onclick="viewCandidateDetails('${c.id}')">View</button>
            </td>
        </tr>
    `).join('');
}

async function viewCandidateDetails(candidateId) {
    const res = await fetch(`/api/admin/candidate/${candidateId}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    const candidate = data.candidate;
    
    document.getElementById('candidateName').textContent = candidate.name;
    document.getElementById('candidateEmail').textContent = candidate.email;
    document.getElementById('candidateExp').textContent = candidate.experienceYears;
    
    const tbody = document.getElementById('assessmentBody');
    tbody.innerHTML = candidate.allAttempts.map(attempt => `
        <tr>
            <td>${new Date(attempt.startTime).toLocaleDateString()}</td>
            <td>${attempt.averageScore}%</td>
            <td>${calculateDuration(attempt.startTime, attempt.endTime)}</td>
            <td>${attempt.completionPercentage}%</td>
            <td>
                <button onclick="viewSessionDetails('${attempt.sessionId}')">View</button>
            </td>
        </tr>
    `).join('');
    
    document.getElementById('candidates').style.display = 'none';
    document.getElementById('candidateDetail').style.display = 'block';
}

async function viewSessionDetails(sessionId) {
    const res = await fetch(`/api/admin/session/${sessionId}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    const session = data.session;
    
    document.getElementById('sessionCandidate').textContent = session.candidateName;
    document.getElementById('sessionDuration').textContent = session.metrics.totalTime;
    document.getElementById('sessionAvgScore').textContent = session.metrics.averageScore + '%';
    document.getElementById('sessionTabSwitches').textContent = session.metrics.tabSwitches;
    
    const questionsDiv = document.getElementById('questionsBreakdown');
    questionsDiv.innerHTML = session.questions.map((q, idx) => `
        <div class="question-detail">
            <h4>Q${idx+1}: ${q.title}</h4>
            <p><strong>Status:</strong> ${q.status}</p>
            <p><strong>Score:</strong> ${q.agentScore}%</p>
            <p><strong>Language:</strong> ${q.language}</p>
            <div class="code-comparison">
                <div class="code-block">
                    <h5>Submitted Code:</h5>
                    <pre><code>${escapeHtml(q.submittedCode)}</code></pre>
                </div>
                <div class="output-comparison">
                    <div class="output-block">
                        <h5>Expected Output:</h5>
                        <pre>${escapeHtml(q.expectedOutput)}</pre>
                    </div>
                    <div class="output-block">
                        <h5>Actual Output:</h5>
                        <pre>${escapeHtml(q.actualOutput)}</pre>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
    
    document.getElementById('candidateDetail').style.display = 'none';
    document.getElementById('sessionDetail').style.display = 'block';
}

async function validateToken() {
    const res = await fetch('/api/auth/validate-token', {
        headers: { 'Authorization': `Bearer ${authToken}` }
    });
    return res.ok;
}

function logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userRole');
    window.location.href = '/login.html';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function calculateDuration(startTime, endTime) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const diffMs = end - start;
    const diffMins = Math.floor(diffMs / 60000);
    return `${diffMins} min`;
}

// Load dashboard on page load
loadDashboard();
```

### 3.3 Routing Logic
Modify `public/index.html` to route based on login role:

```html
<!-- Before Assessment -->
<script>
    const userRole = localStorage.getItem('userRole');
    const authToken = localStorage.getItem('authToken');
    
    if (!authToken) {
        window.location.href = '/login.html';
    } else if (userRole === 'admin') {
        window.location.href = '/admin-dashboard.html';
    } else if (userRole === 'candidate') {
        // Load assessment as usual
        console.log('Loading candidate assessment...');
    }
</script>
```

---

## Phase 4: Implementation Steps

### Step 1: Database Setup
```bash
# Create user management system
# Option A: Use JSON files
# Option B: Use SQLite/MongoDB
```

### Step 2: Backend API
1. Add authentication endpoints in `src/server.js`
2. Add admin-only endpoints
3. Add middleware for role-based access

### Step 3: Frontend
1. Create `public/login.html`
2. Create `public/admin-dashboard.html`
3. Create `public/admin-dashboard.js`
4. Update `public/index.html` with routing logic

### Step 4: Security
- Implement JWT token generation and validation
- Hash passwords (bcrypt)
- Add CORS for admin access
- Log all admin activities

---

## Phase 5: Features to Add

### For Admin Dashboard:
- ✅ View all candidates
- ✅ View candidate performance
- ✅ View submitted code
- ✅ Compare expected vs actual output
- ✅ Analytics/Charts
- ✅ Export reports (CSV/PDF)
- ✅ Real-time session monitoring
- ✅ Candidate comparison
- ✅ Question difficulty analysis
- ✅ Search and filter

### For Candidate:
- ✅ Take assessment
- ✅ View own results
- ✅ Download report

---

## File Structure Summary

```
public/
  ├── index.html (candidate assessment)
  ├── app.js (candidate logic)
  ├── login.html (NEW - login page)
  ├── login-styles.css (NEW - login styling)
  ├── admin-dashboard.html (NEW - admin UI)
  ├── admin-dashboard.js (NEW - admin logic)
  └── admin-dashboard-styles.css (NEW - admin styling)

src/
  ├── server.js (add auth & admin endpoints)
  └── auth.js (NEW - authentication helper)

data/
  ├── users.json (NEW - user database)
  ├── config.js (add admin config)
  └── questions.json (existing)
```

---

## Security Considerations

1. **Password Hashing:** Use bcrypt library
2. **JWT Tokens:** Use HS256 or RS256 algorithms
3. **Token Expiry:** 1-24 hours based on requirements
4. **HTTPS:** Use SSL/TLS in production
5. **CORS:** Restrict to trusted domains
6. **Rate Limiting:** Prevent brute force attacks
7. **Audit Logs:** Log all admin activities

---

## Next Steps

Would you like me to:
1. Create the login page and authentication system?
2. Implement the admin dashboard backend endpoints?
3. Create the admin UI components?
4. Set up the database schema for users?

Let me know which phase you'd like to start with!
