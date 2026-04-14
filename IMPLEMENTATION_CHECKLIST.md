# Admin Dashboard Implementation Checklist

## Phase 1: Authentication System ✓ (Priority: HIGH)

### 1.1 Backend Setup
- [ ] Create `src/auth.js` with JWT functions
  - `generateToken(userId, role)`
  - `verifyToken(token)`
  - `hashPassword(password)`
  - `comparePassword(password, hash)`
  
- [ ] Create `data/users.json` with user database
  ```json
  {
    "users": [
      {"id": "1", "email": "admin@company.com", "role": "admin", "password": "hash", "name": "Admin User"},
      {"id": "2", "email": "candidate1@gmail.com", "role": "candidate", "password": "hash", "name": "John Doe"}
    ]
  }
  ```

- [ ] Add authentication endpoints in `src/server.js`:
  ```
  POST   /api/auth/login         (email, password) -> token + role
  POST   /api/auth/logout        
  GET    /api/auth/validate-token
  POST   /api/auth/register      (NEW users option)
  ```

- [ ] Add middleware functions:
  ```javascript
  authenticateToken(req, res, next)
  authorizeAdmin(req, res, next)
  authorizeCandidate(req, res, next)
  ```

### 1.2 Frontend Setup
- [ ] Create `public/login.html` - Login form
- [ ] Create `public/login-styles.css` - Login styling
- [ ] Create `public/auth.js` - Client-side auth logic
- [ ] Update `public/index.html` - Add auth check
  ```javascript
  if (!authToken) redirect to login
  if (role === 'admin') redirect to admin-dashboard
  if (role === 'candidate') show assessment
  ```

---

## Phase 2: Admin Data Endpoints ✓ (Priority: HIGH)

### 2.1 Backend Endpoints
- [ ] GET `/api/admin/candidates` 
  - Returns list of all candidates with summary stats
  - Requires admin authentication
  
- [ ] GET `/api/admin/candidate/:candidateId`
  - Returns complete candidate profile
  - All assessment attempts
  - Performance metrics
  
- [ ] GET `/api/admin/session/:sessionId`
  - Returns detailed session data
  - Questions, code, outputs, scores
  - Time metrics
  
- [ ] GET `/api/admin/analytics`
  - Overall statistics
  - Score distribution
  - Question difficulty analysis
  
- [ ] GET `/api/admin/reports/export`
  - Export candidate data (CSV)
  - Export reports (PDF)

### 2.2 Data Modifications
- [ ] Extend result objects to include:
  ```javascript
  {
    candidateId,
    candidateEmail,
    candidateName,
    sessionId,
    questions: [ { submittedCode, language, score, output } ],
    metrics: { tabSwitches, completionPercentage, totalTime }
  }
  ```

- [ ] Update `/api/result` endpoint to store enhanced data

---

## Phase 3: Admin Dashboard UI ✓ (Priority: HIGH)

### 3.1 Dashboard Components
- [ ] Create `public/admin-dashboard.html`
  - Navigation/Sidebar
  - Dashboard overview cards (metrics)
  - Candidates list table
  - Filters & Search
  
- [ ] Create `public/admin-dashboard.js`
  - Load dashboard data
  - Handle pagination
  - Modal/detail views
  - Export functions
  
- [ ] Create `public/admin-dashboard-styles.css`
  - Professional dashboard styling
  - Dark/Light theme support
  - Responsive design

### 3.2 Dashboard Sections
- [ ] **Overview Section**
  - Total candidates
  - Active sessions
  - Completed assessments
  - Average score
  - Charts/Graphs
  
- [ ] **Candidates Section**
  - Table with sorting/filtering
  - Search by name/email
  - Status indicators
  - View details button
  
- [ ] **Candidate Detail Section**
  - Personal info
  - Assessment history
  - Performance trends
  - Export option
  
- [ ] **Session Detail Section**
  - Question breakdown
  - Code viewer
  - Output comparison
  - Scoring details
  
- [ ] **Analytics Section**
  - Score distribution chart
  - Question difficulty analysis
  - Language preference stats
  - Time spent analysis

---

## Phase 4: Security Features ✓ (Priority: CRITICAL)

### 4.1 Backend Security
- [ ] Install `bcryptjs` package
  ```bash
  npm install bcryptjs jsonwebtoken
  ```
  
- [ ] Implement password hashing
  - Hash on registration/password change
  - Compare on login
  
- [ ] Implement JWT tokens
  - Generate on login
  - Validate on protected routes
  - Expire tokens (24 hours)
  
- [ ] Add token middleware
  - Check Authorization header
  - Validate JWT signature
  - Check role permissions

### 4.2 Frontend Security
- [ ] Store auth token in localStorage (or sessionStorage)
- [ ] Send token in Authorization header
- [ ] Handle token expiry
- [ ] Redirect unauthorized users to login
- [ ] Clear token on logout

### 4.3 Data Security
- [ ] Never expose passwords
- [ ] Never expose sensitive student data to other students
- [ ] Audit log admin activities
- [ ] Validate all admin API calls
- [ ] Add CORS headers

---

## Phase 5: Enhanced Features (Priority: MEDIUM)

### 5.1 Filtering & Search
- [ ] Filter candidates by:
  - Status (completed, pending, in-progress)
  - Experience level
  - Score range
  - Date range
  
- [ ] Search by name/email

### 5.2 Reporting
- [ ] Export to CSV
- [ ] Export to PDF
- [ ] Filter before export
- [ ] Custom report builder

### 5.3 Monitoring
- [ ] Real-time session monitoring
- [ ] Live candidate list
- [ ] Active sessions indicator
- [ ] Notifications for new submissions

### 5.4 Analytics
- [ ] Score distribution chart
- [ ] Question difficulty heatmap
- [ ] Language preference pie chart
- [ ] Time spent histogram
- [ ] Candidate comparison chart

---

## Phase 6: Testing ✓ (Priority: MEDIUM)

### 6.1 Backend Testing
- [ ] Test login with valid credentials
- [ ] Test login with invalid credentials
- [ ] Test admin endpoints (with/without token)
- [ ] Test unauthorized access
- [ ] Test token expiry

### 6.2 Frontend Testing
- [ ] Test login flow
- [ ] Test dashboard loading
- [ ] Test pagination
- [ ] Test export functionality
- [ ] Test responsive design

### 6.3 Security Testing
- [ ] Test XSS prevention
- [ ] Test SQL injection (if using DB)
- [ ] Test unauthorized access
- [ ] Test token tampering

---

## Timeline Estimate

| Phase | Tasks | Effort | Days |
|-------|-------|--------|------|
| 1 | Auth System | HIGH | 2-3 |
| 2 | Admin Endpoints | HIGH | 2-3 |
| 3 | Admin UI | HIGH | 3-4 |
| 4 | Security | CRITICAL | 1-2 |
| 5 | Features | MEDIUM | 2-3 |
| 6 | Testing | MEDIUM | 1-2 |
| **Total** | | | **11-17 days** |

---

## Quick Start Guide

### To Begin Implementation:

1. **Start with Phase 1 (Authentication)**
   ```bash
   npm install bcryptjs jsonwebtoken
   ```
   
2. **Create auth files:**
   - `src/auth.js` - JWT & password functions
   - `data/users.json` - User database
   - `public/login.html` - Login form
   
3. **Add endpoints to `src/server.js`:**
   - POST /api/auth/login
   - GET /api/auth/validate-token
   
4. **Test login flow:**
   - Create test user in data/users.json
   - Test login from frontend
   - Verify token is returned

5. **Move to Phase 2 (Admin Endpoints)**
   - Add /api/admin/candidates
   - Add /api/admin/candidate/:id
   - Test with admin token

6. **Continue with Phase 3 (Admin UI)**
   - Create dashboard HTML
   - Add JavaScript to load data
   - Style with CSS

---

## Key Files to Create/Modify

### New Files:
```
src/auth.js                              (Auth helper functions)
data/users.json                          (User database)
public/login.html                        (Login page)
public/login-styles.css                  (Login styling)
public/auth.js                           (Client-side auth)
public/admin-dashboard.html              (Admin UI)
public/admin-dashboard.js                (Admin logic)
public/admin-dashboard-styles.css        (Admin styling)
```

### Modified Files:
```
src/server.js                            (Add auth & admin endpoints)
data/config.js                           (Add admin config)
public/index.html                        (Add routing logic)
package.json                             (Add dependencies)
```

---

## Support

For questions or clarifications, refer to the detailed guide:
`ADMIN_DASHBOARD_IMPLEMENTATION_GUIDE.md`
