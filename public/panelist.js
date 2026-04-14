let currentSessionData = null;
let currentViewType = 'table';
let allCandidatesData = null;

// ==================== COLUMN FILTER STATE ====================
const columnFilters = {}; // { colIndex: Set of selected values }
const columnKeys = ['idx','name','email','location','experience','language','correctPrograms','testScore','agentScore','aiLikelihoodAvg','aiLikelihoodMax','totalTabSwitches','totalTime','submittedAt'];

function getCellValue(c, colIdx) {
    switch(colIdx) {
        case 1: return c.name || '';
        case 2: return c.email || '';
        case 3: return c.location || '';
        case 4: return c.experience || '';
        case 5: return c.language || '';
        case 6: return c.correctPrograms || '';
        case 7: return (c.testScore || '0') + '%';
        case 8: return (c.agentScore || '0') + '%';
        case 9: return (c.aiLikelihoodAvg || '0') + '%';
        case 10: return (c.aiLikelihoodMax || '0') + '%';
        case 11: return c.totalTabSwitches || '0';
        case 12: return c.totalTime || '';
        case 13: return c.submittedAt || '';
        default: return '';
    }
}

function getFilteredCandidates() {
    if (!allCandidatesData || !allCandidatesData.candidates) return [];
    return allCandidatesData.candidates.filter(c => {
        for (const colStr in columnFilters) {
            const col = parseInt(colStr);
            const allowed = columnFilters[col];
            if (allowed && allowed.size > 0) {
                const val = getCellValue(c, col);
                if (!allowed.has(val)) return false;
            }
        }
        return true;
    });
}

function toggleFilter(colIdx, event) {
    event.stopPropagation();
    // Close all other dropdowns
    document.querySelectorAll('.col-filter-dropdown.open').forEach(el => {
        if (el.id !== 'cfd-' + colIdx) el.classList.remove('open');
    });

    const dd = document.getElementById('cfd-' + colIdx);
    if (dd.classList.contains('open')) {
        dd.classList.remove('open');
        return;
    }

    // Build unique values for this column
    const candidates = allCandidatesData ? allCandidatesData.candidates : [];
    const uniqueVals = [...new Set(candidates.map(c => getCellValue(c, colIdx)))].sort();
    const currentFilter = columnFilters[colIdx];

    let html = '<input class="cf-search" placeholder="Search..." oninput="filterDropdownSearch(' + colIdx + ',this.value)">';
    html += '<label class="cf-option"><input type="checkbox" class="cf-selall" data-col="' + colIdx + '" onchange="filterSelectAll(' + colIdx + ',this.checked)" checked> (Select All)</label>';
    html += '<div class="cf-list" id="cfl-' + colIdx + '">';
    uniqueVals.forEach(v => {
        const checked = !currentFilter || currentFilter.has(v) ? 'checked' : '';
        html += '<label class="cf-option"><input type="checkbox" class="cf-cb" data-col="' + colIdx + '" value="' + v.replace(/"/g, '&quot;') + '" ' + checked + '> ' + (v || '(empty)') + '</label>';
    });
    html += '</div>';
    html += '<div class="cf-actions"><button class="cf-ok" onclick="applyColumnFilter(' + colIdx + ')">OK</button><button class="cf-cancel" onclick="closeFilter(' + colIdx + ')">Cancel</button></div>';

    dd.innerHTML = html;
    dd.classList.add('open');
}

function filterDropdownSearch(colIdx, query) {
    const list = document.getElementById('cfl-' + colIdx);
    const labels = list.querySelectorAll('.cf-option');
    const q = query.toLowerCase();
    labels.forEach(lbl => {
        const text = lbl.textContent.toLowerCase();
        lbl.style.display = text.includes(q) ? '' : 'none';
    });
}

function filterSelectAll(colIdx, checked) {
    const list = document.getElementById('cfl-' + colIdx);
    list.querySelectorAll('.cf-cb').forEach(cb => { if (cb.closest('.cf-option').style.display !== 'none') cb.checked = checked; });
}

function applyColumnFilter(colIdx) {
    const list = document.getElementById('cfl-' + colIdx);
    const checkboxes = list.querySelectorAll('.cf-cb');
    const allChecked = [...checkboxes].every(cb => cb.checked);
    const noneChecked = [...checkboxes].every(cb => !cb.checked);

    if (allChecked || noneChecked) {
        delete columnFilters[colIdx];
    } else {
        const selected = new Set();
        checkboxes.forEach(cb => { if (cb.checked) selected.add(cb.value); });
        columnFilters[colIdx] = selected;
    }

    closeFilter(colIdx);
    renderFilteredTable();
    updateFilterButtons();
}

function closeFilter(colIdx) {
    document.getElementById('cfd-' + colIdx).classList.remove('open');
}

function clearAllFilters() {
    for (const key in columnFilters) delete columnFilters[key];
    renderFilteredTable();
    updateFilterButtons();
}

function updateFilterButtons() {
    // Highlight active filter buttons
    document.querySelectorAll('.col-filter-btn').forEach(btn => {
        const th = btn.closest('th');
        const col = th ? parseInt(th.dataset.col) : -1;
        if (columnFilters[col]) {
            btn.classList.add('active');
            btn.textContent = '▼✓';
        } else {
            btn.classList.remove('active');
            btn.textContent = '▼';
        }
    });

    // Show/hide filter summary bar
    const activeCount = Object.keys(columnFilters).length;
    const summary = document.getElementById('filterSummary');
    if (activeCount > 0) {
        const filtered = getFilteredCandidates();
        const total = allCandidatesData ? allCandidatesData.candidates.length : 0;
        document.getElementById('filterSummaryText').textContent = `Showing ${filtered.length} of ${total} candidates (${activeCount} filter${activeCount > 1 ? 's' : ''} active)`;
        summary.style.display = 'flex';
    } else {
        summary.style.display = 'none';
    }
}

function renderFilteredTable() {
    const candidates = getFilteredCandidates();
    const tbody = document.getElementById('candidatesBody');

    if (candidates.length === 0) {
        tbody.innerHTML = '<tr><td colspan="15" style="text-align:center;padding:20px;">No candidates match the current filters</td></tr>';
        return;
    }

    tbody.innerHTML = candidates.map((c, idx) => `
        <tr>
            <td>${idx + 1}</td>
            <td><strong>${c.name}</strong></td>
            <td>${c.email}</td>
            <td>${c.location}</td>
            <td>${c.experience}</td>
            <td>${c.language}</td>
            <td>${c.correctPrograms}</td>
            <td>${c.testScore}%</td>
            <td>${c.agentScore}%</td>
            <td>${c.aiLikelihoodAvg}%</td>
            <td>${c.aiLikelihoodMax}%</td>
            <td>${c.totalTabSwitches}</td>
            <td>${c.totalTime}</td>
            <td>${c.submittedAt}</td>
            <td>
                <button onclick="viewResults('${c.sessionId}')" class="btn-view">View Code & Results</button>
            </td>
        </tr>
    `).join('');
}

// Close dropdowns when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.col-filter-dropdown') && !e.target.closest('.col-filter-btn')) {
        document.querySelectorAll('.col-filter-dropdown.open').forEach(el => el.classList.remove('open'));
    }
});

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Check if user is logged in and authorized as panelist
    const candidateId = localStorage.getItem('candidateId');
    const sessionId = localStorage.getItem('sessionId');
    
    if (!candidateId || !sessionId) {
        window.location.href = '/index.html';
        return;
    }

    // Fetch panelist whitelist from config
    try {
        const res = await fetch('/api/config');
        const cfg = await res.json();
        const allowed = (cfg.panelistEmails || []).map(e => e.trim().toLowerCase());
        if (!allowed.includes((candidateId || '').trim().toLowerCase())) {
            window.location.href = '/index.html';
            return;
        }
    } catch (err) {
        window.location.href = '/index.html';
        return;
    }
    
    // Show candidate name if available
    const candidateName = localStorage.getItem('candidateName') || 'Admin';
    document.getElementById('userName').textContent = 'Welcome, ' + candidateName;
    
    // Set today's date in IST as default (server stores files using IST dates)
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000; // IST = UTC + 5:30
    const istNow = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + istOffset);
    const today = istNow.getFullYear() + '-' +
        String(istNow.getMonth() + 1).padStart(2, '0') + '-' +
        String(istNow.getDate()).padStart(2, '0');
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
        allCandidatesData = data;
        
        // Categorize candidates by score
        const excellent = data.candidates.filter(c => c.score >= 75).length;
        const good = data.candidates.filter(c => c.score >= 50 && c.score < 75).length;
        const average = data.candidates.filter(c => c.score >= 25 && c.score < 50).length;
        const poor = data.candidates.filter(c => c.score < 25).length;
        const total = data.totalCandidates;
        
        // Update summary cards
        document.getElementById('totalCandidates').textContent = total;
        document.getElementById('excellentCount').textContent = excellent + '/' + total;
        document.getElementById('goodCount').textContent = good + '/' + total;
        document.getElementById('averageCount').textContent = average + '/' + total;
        document.getElementById('poorCount').textContent = poor + '/' + total;
        
        // Update candidates table
        const tbody = document.getElementById('candidatesBody');
        if (data.candidates.length === 0) {
            tbody.innerHTML = '<tr><td colspan="15" style="text-align: center; padding: 20px;">No candidates attended on this date</td></tr>';
            return;
        }
        
        // Clear filters and render table
        clearAllFilters();
        renderFilteredTable();
        
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
    
    // Handle actual output - show empty message if no output
    const actualOutput = question.actualOutput;
    if (!actualOutput || actualOutput === '[object Object]' || actualOutput === '') {
        document.getElementById('actualOutput').textContent = '(No output)';
    } else {
        document.getElementById('actualOutput').textContent = actualOutput;
    }
    
    // Hide result modal, show code modal
    document.getElementById('resultModal').style.display = 'none';
    document.getElementById('codeModal').style.display = 'block';
}

// Download CSV - export table view data matching panel columns
function downloadCSV() {
    if (!allCandidatesData || !allCandidatesData.candidates || allCandidatesData.candidates.length === 0) {
        alert('No candidate data to export. Please load data first.');
        return;
    }

    const date = document.getElementById('dateFilter').value;
    const headers = ['#','Candidate Name','Email','Location','Experience (Yrs)','Language','Programs Completed','Test Score (%)','Agent Score (%)','Plagiarism Avg (%)','Plagiarism Max (%)','Total Tab Switches','Total Time','Submitted At'];

    let csv = '\uFEFF' + headers.join(',') + '\n';
    const candidates = getFilteredCandidates();
    candidates.forEach((c, idx) => {
        const row = [
            idx + 1,
            `"${(c.name || '').replace(/"/g, '""')}"`,
            `"${(c.email || '').replace(/"/g, '""')}"`,
            `"${(c.location || '').replace(/"/g, '""')}"`,
            `"${c.experience || ''}"`,
            `"${c.language || ''}"`,
            `"\t${c.correctPrograms || ''}"`,
            c.testScore || 0,
            c.agentScore || 0,
            c.aiLikelihoodAvg || 0,
            c.aiLikelihoodMax || 0,
            c.totalTabSwitches || 0,
            `"${c.totalTime || ''}"`,
            `"${c.submittedAt || ''}"`
        ];
        csv += row.join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `panel-candidates-${date}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
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
    window.location.href = '/public/index.html';
}

// Download session report - directly download the candidate's performance CSV
function downloadSessionReport() {
    if (!currentSessionData || !currentSessionData.candidateName) {
        alert('No session data available');
        return;
    }
    const candidateName = currentSessionData.candidateName;
    window.location.href = `/api/download/csv?name=${encodeURIComponent(candidateName)}`;
}

function generateSessionCSV(session) {
    let csv = 'Date,Time,Candidate Name,Candidate EmailId,Relevant Experience (Years),Question #,Question Title,Status,Language,Expected Output,Actual Output,Agent Score (%),Plagiarism (%),Session Completion (%),Tab Switches,Question Time Spent\n';
    
    // Add each question as a row
    session.questions.forEach(q => {
        const status = q.status === 'correct' ? 'Correct' : 'Incorrect';
        const actualOutput = q.actualOutput && q.actualOutput !== '[object Object]' ? q.actualOutput : '(No output)';
        
        csv += `"","","${session.candidateName}","${session.candidateEmail}","","${q.questionId}","${q.questionTitle}","${status}","${q.language}","${q.expectedOutput}","${actualOutput}","${q.agentScore}","","${session.completionPercentage}","${session.tabSwitches}","${q.timeTaken}"\n`;
    });
    
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

// ==================== FEEDBACK SECTION ====================
(function initFeedback() {
    const feedbackToggle = document.getElementById('feedbackToggle');
    const feedbackFormContainer = document.getElementById('feedbackFormContainer');
    const feedbackText = document.getElementById('feedbackText');
    const submitFeedbackBtn = document.getElementById('submitFeedbackBtn');
    const cancelFeedbackBtn = document.getElementById('cancelFeedbackBtn');
    const feedbackStatus = document.getElementById('feedbackStatus');

    if (!feedbackToggle) return;

    feedbackToggle.addEventListener('click', () => {
        feedbackFormContainer.classList.toggle('hidden');
        if (!feedbackFormContainer.classList.contains('hidden')) {
            feedbackText.focus();
        }
        feedbackStatus.textContent = '';
        feedbackStatus.className = 'feedback-status';
    });

    cancelFeedbackBtn.addEventListener('click', () => {
        feedbackFormContainer.classList.add('hidden');
        feedbackText.value = '';
        feedbackStatus.textContent = '';
        feedbackStatus.className = 'feedback-status';
    });

    submitFeedbackBtn.addEventListener('click', async () => {
        const text = feedbackText.value.trim();
        if (!text) {
            feedbackStatus.textContent = '⚠ Please write your feedback before submitting.';
            feedbackStatus.className = 'feedback-status error';
            return;
        }

        feedbackStatus.textContent = '⏳ Sending feedback...';
        feedbackStatus.className = 'feedback-status sending';
        submitFeedbackBtn.disabled = true;

        try {
            const candidateName = localStorage.getItem('candidateName') || 'Panelist';
            const candidateEmail = localStorage.getItem('candidateId') || '';
            const res = await fetch('/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    candidateName: candidateName,
                    candidateEmail: candidateEmail,
                    feedback: text
                })
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Failed');
            feedbackStatus.textContent = '✅ ' + (result.message || 'Feedback submitted successfully!');
            feedbackStatus.className = 'feedback-status success';
            feedbackText.value = '';
            setTimeout(() => {
                feedbackFormContainer.classList.add('hidden');
                feedbackStatus.textContent = '';
                feedbackStatus.className = 'feedback-status';
            }, 3000);
        } catch (err) {
            feedbackStatus.textContent = '❌ Failed to submit feedback: ' + (err.message || 'Unknown error');
            feedbackStatus.className = 'feedback-status error';
        } finally {
            submitFeedbackBtn.disabled = false;
        }
    });
})();
