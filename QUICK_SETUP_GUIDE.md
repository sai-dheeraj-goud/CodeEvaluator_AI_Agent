# Quick Panelist Dashboard Setup

## How It Works (No Extra Login!)

1. **User logs in with OTP** (existing flow in `index.html`)
2. **After OTP verification** → Shows 2 buttons:
   - 👨‍💻 **Candidate** - Take the test (existing)
   - 📊 **Admin/Panelist** - View results (new)
3. **Clicks Admin/Panelist** → Goes to `/panelist.html`
4. **Panelist Dashboard** - Shows all candidates for the day with their code & results

---

## Files to Create/Modify

### 1. Create: `public/panelist.html`
Copy the HTML section from `SIMPLE_PANELIST_DASHBOARD.md`

### 2. Create: `public/panelist.js`
Copy the JavaScript section from `SIMPLE_PANELIST_DASHBOARD.md`

### 3. Create: `public/panelist-styles.css`
Copy the CSS section from `SIMPLE_PANELIST_DASHBOARD.md`

### 4. Modify: `public/index.html` (Your existing login page)

After the OTP is verified successfully, show the role selection modal:

```html
<!-- Add this HTML to index.html (inside body) -->
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

<!-- Add this CSS to your styles (or in <style> tag) -->
<style>
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
</style>
```

Then in your existing `app.js` (after OTP verification), add:

```javascript
// After successful OTP verification, show role selection
function verifyOTP() {
    // Your existing OTP verification code...
    // After OTP is verified successfully:
    
    document.getElementById('roleSelectionModal').style.display = 'flex';
}

function goToCandidateDashboard() {
    // Your existing behavior - goes to candidate test
    window.location.href = '/candidate-dashboard.html';
    // Or wherever your candidate test page is
}

function goToPanelistDashboard() {
    window.location.href = '/panelist.html';
}

function logout() {
    localStorage.removeItem('candidateId');
    localStorage.removeItem('sessionId');
    localStorage.removeItem('candidateName');
    localStorage.removeItem('testStartTime');
    // Clear all login-related data
    location.reload();
}
```

---

### 5. Add Backend Endpoints to `src/server.js`

Add these 2 simple endpoints:

```javascript
// Endpoint 1: Get candidates for a specific date
if (pathname === '/api/panelist/daily-summary' && req.method === 'GET') {
    const url = new URL(req.url, 'http://localhost');
    const date = url.searchParams.get('date');
    
    // Read results directory
    const fs = require('fs');
    const resultsDir = path.join(__dirname, '../results/json');
    
    try {
        const files = fs.readdirSync(resultsDir);
        const candidatesMap = {};
        let totalScore = 0;
        let count = 0;
        
        files.forEach(file => {
            const filePath = path.join(resultsDir, file);
            const content = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(content);
            
            // Check if date matches
            const submittedDate = new Date(data.submittedAt).toISOString().split('T')[0];
            
            if (submittedDate === date) {
                candidatesMap[data.candidateId] = {
                    id: data.candidateId,
                    name: data.candidateName || 'Unknown',
                    email: data.candidateEmail || 'unknown@example.com',
                    score: data.agentScore || 0,
                    status: 'completed',
                    sessionId: data.sessionId,
                    submittedAt: data.submittedAt
                };
                totalScore += data.agentScore || 0;
                count++;
            }
        });
        
        const candidates = Object.values(candidatesMap);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            date,
            totalCandidates: candidates.length,
            completed: candidates.length,
            inProgress: 0,
            skipped: 0,
            averageScore: count > 0 ? Math.round(totalScore / count) : 0,
            candidates
        }));
    } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
    }
    return;
}

// Endpoint 2: Get candidate session details
if (pathname.match(/^\/api\/panelist\/candidate-session\/[^/]+$/) && req.method === 'GET') {
    const sessionId = pathname.split('/').pop();
    
    const fs = require('fs');
    const resultsDir = path.join(__dirname, '../results/json');
    
    try {
        const files = fs.readdirSync(resultsDir);
        let sessionData = null;
        
        for (const file of files) {
            const filePath = path.join(resultsDir, file);
            const content = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(content);
            
            if (data.sessionId === sessionId) {
                sessionData = data;
                break;
            }
        }
        
        if (!sessionData) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Session not found' }));
            return;
        }
        
        // Transform data for panelist view
        const response = {
            sessionId: sessionData.sessionId,
            candidateId: sessionData.candidateId,
            candidateName: sessionData.candidateName,
            candidateEmail: sessionData.candidateEmail,
            overallScore: sessionData.agentScore || 0,
            totalTime: sessionData.totalTime || 'N/A',
            tabSwitches: sessionData.tabSwitches || 0,
            completionPercentage: Math.round((sessionData.questionsAttempted / sessionData.totalQuestions) * 100) || 0,
            questions: sessionData.questions.map(q => ({
                questionId: q.questionId,
                questionTitle: q.questionTitle,
                status: q.agentScore >= 75 ? 'correct' : 'incorrect',
                agentScore: q.agentScore,
                language: q.language,
                timeTaken: q.timeTaken || 'N/A',
                submittedCode: q.submittedCode,
                expectedOutput: q.expectedOutput,
                actualOutput: q.actualOutput
            }))
        };
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
    } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
    }
    return;
}
```

---

## Testing the Setup

1. **Start the server**
   ```bash
   node src/server.js
   ```

2. **Go to login page**
   ```
   http://localhost:3000
   ```

3. **Login with OTP** (existing flow)

4. **See role selection buttons**
   - Click "Admin/Panelist" button

5. **View panelist dashboard**
   - Select a date
   - See all candidates for that date
   - Click "View Code & Results" on any candidate
   - See their code and results

---

## Current Status

✅ **No additional authentication needed** - Uses existing OTP login
✅ **Simple 2-button selection** - After successful login
✅ **One-click view** - See all candidate code & results
✅ **Date filtering** - View candidates by date
✅ **Minimal setup** - Just 2 backend endpoints

---

## Summary

Your idea is perfect! By reusing the existing login:
- Users log in once with OTP
- Then choose: Candidate or Admin/Panelist
- Each goes to their respective dashboard
- **No separate login for admin** 
- **No extra authentication complexity**

This is the cleanest approach! 🎉
