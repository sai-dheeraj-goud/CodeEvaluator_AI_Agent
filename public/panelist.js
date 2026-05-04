let currentSessionData = null;
let currentViewType = 'table';
let allCandidatesData = null;
let activeScoreFilter = null; // null = show all, 'excellent'|'good'|'average'|'poor'

// ==================== SCORE RANGE FILTER ====================
const scoreRanges = {
    excellent: { min: 75, max: 100, label: 'Excellent (75-100%)' },
    good:      { min: 50, max: 74,  label: 'Good (50-74%)' },
    average:   { min: 25, max: 49,  label: 'Average (25-49%)' },
    poor:      { min: 0,  max: 24,  label: 'Poor (0-24%)' }
};

function filterByScoreRange(range) {
    // Toggle off if clicking the same card again, or clicking "all"
    if (range === 'all' || activeScoreFilter === range) {
        activeScoreFilter = null;
    } else {
        activeScoreFilter = range;
    }

    // Update card visual states
    document.querySelectorAll('.summary-cards .card').forEach(card => {
        card.classList.remove('card-active');
    });
    if (activeScoreFilter) {
        const activeCard = document.querySelector(`.card[data-filter="${activeScoreFilter}"]`);
        if (activeCard) activeCard.classList.add('card-active');
    }

    // Update section header label
    const filterLabel = document.getElementById('scoreFilterLabel');
    if (activeScoreFilter && scoreRanges[activeScoreFilter]) {
        filterLabel.textContent = scoreRanges[activeScoreFilter].label;
        filterLabel.className = 'score-filter-label ' + activeScoreFilter;
    } else {
        filterLabel.textContent = '';
        filterLabel.className = 'score-filter-label';
    }

    // Scroll to the candidates table
    document.querySelector('.candidates-section').scrollIntoView({ behavior: 'smooth', block: 'start' });

    renderFilteredTable();
}

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
        // Apply score range filter (from summary cards) — based on Agent Score
        if (activeScoreFilter && scoreRanges[activeScoreFilter]) {
            const range = scoreRanges[activeScoreFilter];
            const score = parseFloat(c.agentScore) || 0;
            if (score < range.min || score > range.max) return false;
        }

        // Apply column filters
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

    // Also clear score range filter
    activeScoreFilter = null;
    document.querySelectorAll('.summary-cards .card').forEach(card => card.classList.remove('card-active'));
    const filterLabel = document.getElementById('scoreFilterLabel');
    if (filterLabel) {
        filterLabel.textContent = '';
        filterLabel.className = 'score-filter-label';
    }

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
    const activeCount = Object.keys(columnFilters).length + (activeScoreFilter ? 1 : 0);
    const summary = document.getElementById('filterSummary');
    if (activeCount > 0) {
        const filtered = getFilteredCandidates();
        const total = allCandidatesData ? allCandidatesData.candidates.length : 0;
        const scoreLabel = activeScoreFilter ? ` | ${scoreRanges[activeScoreFilter].label}` : '';
        document.getElementById('filterSummaryText').textContent = `Showing ${filtered.length} of ${total} candidates (${activeCount} filter${activeCount > 1 ? 's' : ''} active${scoreLabel})`;
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
        
        // Categorize candidates by Agent Score
        const excellent = data.candidates.filter(c => (c.agentScore || 0) >= 75).length;
        const good = data.candidates.filter(c => (c.agentScore || 0) >= 50 && (c.agentScore || 0) < 75).length;
        const average = data.candidates.filter(c => (c.agentScore || 0) >= 25 && (c.agentScore || 0) < 50).length;
        const poor = data.candidates.filter(c => (c.agentScore || 0) < 25).length;
        const total = data.totalCandidates;
        
        // Update summary cards
        document.getElementById('totalCandidates').textContent = total;
        document.getElementById('excellentCount').textContent = excellent + '/' + total;
        document.getElementById('goodCount').textContent = good + '/' + total;
        document.getElementById('averageCount').textContent = average + '/' + total;
        document.getElementById('poorCount').textContent = poor + '/' + total;

        // Render the score distribution pie chart
        renderScorePieChart(excellent, good, average, poor);
        
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
        
        // Update candidate info
        document.getElementById('modalExperience').textContent = data.experience || 'N/A';
        document.getElementById('modalLocation').textContent = data.location || 'N/A';
        document.getElementById('modalLanguage').textContent = data.language || 'N/A';
        document.getElementById('modalPrograms').textContent = data.programsCompleted || 0;
        document.getElementById('modalTotalPrograms').textContent = data.totalPrograms || 0;
        
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
                <div class="question-actions">
                    <button onclick="viewCode(${q.questionId})" class="btn-view-code">View Code</button>
                    <button onclick="viewAgentScore(${q.questionId})" class="btn-agent-score">Agent Score</button>
                </div>
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

// View agent score details for a question
function viewAgentScore(questionId) {
    const q = currentSessionData.questions.find(qn => qn.questionId === questionId);
    if (!q) return;

    const modal = document.getElementById('agentScoreModal');
    document.getElementById('agentScoreModalTitle').textContent = `Q${q.questionId}: ${q.questionTitle}`;

    // Determine plagiarism level label
    const plag = q.aiLikelihood || 0;
    let plagLabel = 'Low';
    let plagClass = 'plag-low';
    if (plag >= 70) { plagLabel = 'High'; plagClass = 'plag-high'; }
    else if (plag >= 40) { plagLabel = 'Medium'; plagClass = 'plag-medium'; }

    // Build covered list
    const coveredHtml = (q.agentCovered && q.agentCovered.length > 0)
        ? q.agentCovered.map(c => `<li>✅ ${escapeHtml(c)}</li>`).join('')
        : '<li class="empty-list">No criteria covered</li>';

    // Build missed list (only if there are missed criteria)
    const hasMissed = q.agentMissed && q.agentMissed.length > 0;
    const missedHtml = hasMissed
        ? q.agentMissed.map(m => `<li>❌ ${escapeHtml(m)}</li>`).join('')
        : '';

    // Build plagiarism reasons
    const reasonsHtml = (q.aiReasons && q.aiReasons.length > 0)
        ? q.aiReasons.map(r => `<li>⚠️ ${escapeHtml(r)}</li>`).join('')
        : '<li class="empty-list">No plagiarism signals detected</li>';

    document.getElementById('agentScoreModalBody').innerHTML = `
        <div class="agent-detail-header">
            <div class="agent-detail-row">
                <span class="agent-detail-label">💻 Language:</span>
                <span class="agent-detail-value">${(q.language || 'N/A').toUpperCase()}</span>
            </div>
            <div class="agent-detail-row">
                <span class="agent-detail-label">🤖 Agent:</span>
                <span class="agent-detail-value">enhanced-rule-engine</span>
            </div>
            <div class="agent-detail-row">
                <span class="agent-detail-label">Agent Score:</span>
                <span class="agent-detail-value agent-score-big ${q.agentScore >= 75 ? 'score-high' : q.agentScore >= 50 ? 'score-mid' : 'score-low'}">${q.agentScore}%</span>
            </div>
            <div class="agent-detail-row">
                <span class="agent-detail-label">🔍 Plagiarism:</span>
                <span class="agent-detail-value ${plagClass}">${plag}% (${plagLabel})</span>
            </div>
        </div>

        ${(q.aiReasons && q.aiReasons.length > 0) ? `
        <div class="agent-detail-section reasons-section">
            <h4>Reasons</h4>
            <ul>${reasonsHtml}</ul>
        </div>` : ''}

        <div class="agent-detail-section covered-section">
            <h4>✅ Covered</h4>
            <ul>${coveredHtml}</ul>
        </div>

        ${hasMissed ? `
        <div class="agent-detail-section missed-section">
            <h4>❌ Missed</h4>
            <ul>${missedHtml}</ul>
        </div>` : ''}
    `;

    // Hide result modal, show agent score modal
    document.getElementById('resultModal').style.display = 'none';
    modal.style.display = 'block';
}

// ==================== SCORE DISTRIBUTION PIE CHART ====================
function renderScorePieChart(excellent, good, average, poor) {
    const section = document.getElementById('chartSection');
    const total = excellent + good + average + poor;

    // Hide the chart if there's no data
    if (total === 0) {
        if (section) section.style.display = 'none';
        return;
    }

    // Show the chart section
    if (section) section.style.display = 'block';

    const canvas = document.getElementById('scorePieChart');
    if (!canvas) return;

    // Destroy any previous chart instance to avoid duplicates
    if (window.scorePieChartInstance) {
        window.scorePieChartInstance.destroy();
    }

    // Build data — only include slices with non-zero values
    const labels = [];
    const data = [];
    const colors = [];
    if (excellent > 0) { labels.push('Excellent (75-100%)'); data.push(excellent); colors.push('#4CAF50'); }
    if (good > 0)      { labels.push('Good (50-74%)');       data.push(good);      colors.push('#8BC34A'); }
    if (average > 0)   { labels.push('Average (25-49%)');    data.push(average);   colors.push('#FFC107'); }
    if (poor > 0)      { labels.push('Poor (0-24%)');        data.push(poor);      colors.push('#F44336'); }

    const ctx = canvas.getContext('2d');
    window.scorePieChartInstance = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderColor: '#1a1a1a',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#fff', font: { size: 13 } }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.parsed;
                            const percent = ((value / total) * 100).toFixed(1);
                            return `${context.label}: ${value} candidate${value === 1 ? '' : 's'} (${percent}%)`;
                        }
                    }
                }
            }
        }
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function closeAgentScoreModal() {
    document.getElementById('agentScoreModal').style.display = 'none';
    document.getElementById('resultModal').style.display = 'block';
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

// ==================== EMAIL MANAGEMENT (Candidate / Panelist) ====================
let currentEmailType = null;       // 'candidate' or 'panelist'
let currentEmailList = [];

function openEmailManager(type) {
    currentEmailType = type;
    const modal  = document.getElementById('emailManagerModal');
    const title  = document.getElementById('emailManagerTitle');
    const input  = document.getElementById('newEmailInput');
    const search = document.getElementById('emailSearchInput');
    const status = document.getElementById('emailManagerStatus');

    if (type === 'candidate') {
        title.textContent = '👤 Manage Candidate Emails';
    } else {
        title.innerHTML = '<svg class="modal-title-icon" width="20" height="20" viewBox="0 0 24 24" fill="#1f2937" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 1.5 3.5 5v6c0 5.25 3.65 9.99 8.5 11.5 4.85-1.51 8.5-6.25 8.5-11.5V5L12 1.5z"/></svg> Manage Panelist Emails';
    }
    input.value = '';
    search.value = '';
    status.textContent = '';
    status.className = 'email-status';
    clearEmailFile();
    modal.style.display = 'block';
    loadEmailList();

    // Submit on Enter key
    input.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addEmail();
        }
    };
}

function closeEmailManager() {
    document.getElementById('emailManagerModal').style.display = 'none';
    clearEmailFile();
    currentEmailType = null;
    currentEmailList = [];
}

async function loadEmailList() {
    const container = document.getElementById('emailListContainer');
    const countEl   = document.getElementById('emailListCount');
    container.innerHTML = '<p class="email-empty">Loading...</p>';
    try {
        const url = currentEmailType === 'candidate'
            ? '/api/candidate-emails'
            : '/api/panelist-emails';
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to fetch emails');
        const data = await res.json();
        currentEmailList = (data.emails || []).slice().sort((a, b) => a.localeCompare(b));
        countEl.textContent = currentEmailList.length;
        renderEmailList(currentEmailList);
    } catch (err) {
        container.innerHTML = `<p class="email-empty error">Failed to load emails: ${err.message}</p>`;
        countEl.textContent = '0';
    }
}

function renderEmailList(list) {
    const container = document.getElementById('emailListContainer');
    if (!list || list.length === 0) {
        container.innerHTML = '<p class="email-empty">No emails found.</p>';
        return;
    }
    const currentUserEmail = (localStorage.getItem('candidateId') || '').trim().toLowerCase();
    const html = list.map((email, idx) => {
        const isSelf = currentEmailType === 'panelist' && email.toLowerCase() === currentUserEmail;
        const removeBtn = isSelf
            ? `<button class="btn-remove-email" disabled title="You cannot remove your own access">🗑 Remove</button>`
            : `<button class="btn-remove-email" onclick="removeEmail('${escapeAttr(email)}')">🗑 Remove</button>`;
        return `
            <div class="email-row">
                <span class="email-row-index">${idx + 1}</span>
                <span class="email-row-text">${escapeHtml(email)}${isSelf ? ' <em>(you)</em>' : ''}</span>
                ${removeBtn}
            </div>
        `;
    }).join('');
    container.innerHTML = html;
}

function filterEmailList() {
    const term = (document.getElementById('emailSearchInput').value || '').trim().toLowerCase();
    if (!term) {
        renderEmailList(currentEmailList);
        return;
    }
    const filtered = currentEmailList.filter(e => e.toLowerCase().includes(term));
    renderEmailList(filtered);
}

async function addEmail() {
    const input = document.getElementById('newEmailInput');
    const email = (input.value || '').trim();

    if (!email) {
        showEmailStatus('Please enter an email address.', 'error');
        return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showEmailStatus('Please enter a valid email address.', 'error');
        return;
    }

    const url = currentEmailType === 'candidate'
        ? '/api/candidate-emails/add'
        : '/api/panelist-emails/add';

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (!res.ok) {
            showEmailStatus(data.error || 'Failed to add email.', 'error');
            return;
        }
        showEmailStatus(`✓ ${data.message}`, 'success');
        input.value = '';
        await loadEmailList();
    } catch (err) {
        showEmailStatus('Network error: ' + err.message, 'error');
    }
}

async function removeEmail(email) {
    if (!email) return;
    const label = currentEmailType === 'candidate' ? 'candidate' : 'panelist';
    if (!confirm(`Remove ${label} email "${email}"?\n\nThis action cannot be undone.`)) return;

    const url = currentEmailType === 'candidate'
        ? '/api/candidate-emails/remove'
        : '/api/panelist-emails/remove';

    const requesterEmail = (localStorage.getItem('candidateId') || '').trim().toLowerCase();

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, requesterEmail })
        });
        const data = await res.json();
        if (!res.ok) {
            showEmailStatus(data.error || 'Failed to remove email.', 'error');
            return;
        }
        showEmailStatus(`✓ ${data.message}`, 'success');
        await loadEmailList();
    } catch (err) {
        showEmailStatus('Network error: ' + err.message, 'error');
    }
}

function showEmailStatus(message, type) {
    const status = document.getElementById('emailManagerStatus');
    status.textContent = message;
    status.className = 'email-status ' + (type || '');
    if (type === 'success') {
        setTimeout(() => {
            if (status.textContent === message) {
                status.textContent = '';
                status.className = 'email-status';
            }
        }, 3000);
    }
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeAttr(str) {
    return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

// Close email manager modal when clicking outside
window.addEventListener('click', (event) => {
    const modal = document.getElementById('emailManagerModal');
    if (event.target === modal) {
        closeEmailManager();
    }
});

// ==================== EMAIL FILE UPLOAD (CSV / TXT / XLSX) ====================
let pendingFileEmails = []; // emails parsed from the selected file, awaiting upload
let _xlsxLibPromise = null; // lazily loaded SheetJS library

/**
 * Load SheetJS (xlsx) from a CDN on demand. Cached after first load.
 * Pure-frontend: keeps the server's "zero npm install" property intact.
 */
function loadXlsxLib() {
    if (typeof window !== 'undefined' && window.XLSX) {
        return Promise.resolve(window.XLSX);
    }
    if (_xlsxLibPromise) return _xlsxLibPromise;
    _xlsxLibPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
        script.async = true;
        script.onload = () => {
            if (window.XLSX) resolve(window.XLSX);
            else reject(new Error('XLSX library failed to initialise'));
        };
        script.onerror = () => reject(new Error(
            'Could not load Excel parser. Check your internet connection, ' +
            'or convert the file to CSV/TXT.'
        ));
        document.head.appendChild(script);
    });
    return _xlsxLibPromise;
}

function onEmailFileSelected() {
    const fileInput = document.getElementById('emailFileInput');
    const labelText = document.getElementById('fileLabelText');
    const uploadBtn = document.getElementById('uploadBtn');
    const removeBtn = document.getElementById('removeBtn');
    const clearBtn  = document.getElementById('clearFileBtn');

    const file = fileInput.files && fileInput.files[0];
    if (!file) {
        clearEmailFile();
        return;
    }
    // 10MB safety cap (Excel can be larger than plain text)
    if (file.size > 10 * 1024 * 1024) {
        showEmailStatus('File is too large (max 10 MB).', 'error');
        clearEmailFile();
        return;
    }
    const name = file.name || 'file';
    const lowerName = name.toLowerCase();
    const isExcel = lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls');
    const isText  = lowerName.endsWith('.csv')  || lowerName.endsWith('.txt');
    if (!isExcel && !isText) {
        showEmailStatus('Only .csv, .txt, or .xlsx/.xls files are supported.', 'error');
        clearEmailFile();
        return;
    }

    if (isExcel) {
        labelText.textContent = `${name} (parsing Excel...)`;
        uploadBtn.disabled = true;
        if (removeBtn) removeBtn.disabled = true;
        clearBtn.style.display = 'inline-block';
        readExcelFile(file)
            .then(parsed => applyParsedEmails(parsed.emails, name, parsed.duplicates, parsed.invalid))
            .catch(err => {
                showEmailStatus('Failed to read Excel file: ' + err.message, 'error');
                clearEmailFile();
            });
    } else {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = String(e.target.result || '');
            const parsed = parseEmailsFromText(text);
            applyParsedEmails(parsed.emails, name, parsed.duplicates, parsed.invalid);
        };
        reader.onerror = () => {
            showEmailStatus('Failed to read file: ' + (reader.error && reader.error.message || 'unknown error'), 'error');
            clearEmailFile();
        };
        reader.readAsText(file);
    }
}

/**
 * Read an .xlsx/.xls file and harvest every email-like string from
 * every cell of every sheet. Headers, multiple columns, and merged cells
 * all just work because we scan cell text, not by column.
 *
 * Returns { emails, duplicates, invalid }:
 * - emails: unique valid email addresses
 * - duplicates: addresses repeated within the workbook
 * - invalid: non-empty cells that look like email attempts (a "@"-containing
 *   token that fails validation, OR any non-empty cell sitting in a column
 *   that contains at least one valid email but fails validation itself).
 *   Header rows (where the column-name cell sits in an email column) are
 *   skipped so a header like "email" is not flagged as invalid.
 */
function readExcelFile(file) {
    return loadXlsxLib().then(XLSX => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });

                const strictEmail = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
                const looseEmail  = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

                const seenLower = new Set();
                const emails = [];
                const duplicates = [];
                const invalid = [];
                const seenInvalidLower = new Set();

                const recordEmail = (raw) => {
                    const matches = String(raw).match(looseEmail);
                    if (!matches) return false;
                    for (const m of matches) {
                        const lower = m.toLowerCase();
                        if (seenLower.has(lower)) duplicates.push(m);
                        else { seenLower.add(lower); emails.push(m); }
                    }
                    return true;
                };
                const recordInvalid = (raw) => {
                    const trimmed = String(raw).trim();
                    if (!trimmed) return;
                    const lower = trimmed.toLowerCase();
                    if (seenInvalidLower.has(lower)) return;
                    seenInvalidLower.add(lower);
                    invalid.push(trimmed);
                };

                for (const sheetName of workbook.SheetNames) {
                    const sheet = workbook.Sheets[sheetName];
                    if (!sheet) continue;
                    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
                    if (rows.length === 0) continue;

                    // Pass 1: figure out which columns contain at least one valid email.
                    const colHasEmail = {};
                    for (let r = 0; r < rows.length; r++) {
                        const row = rows[r] || [];
                        for (let c = 0; c < row.length; c++) {
                            const cellText = String(row[c] == null ? '' : row[c]);
                            if (strictEmail.test(cellText.trim()) || looseEmail.test(cellText)) {
                                colHasEmail[c] = true;
                            }
                            // Reset the global flag of looseEmail so .test calls don't drift
                            looseEmail.lastIndex = 0;
                        }
                    }

                    // Pass 2: classify each cell.
                    // - If cell text matches the loose email regex, harvest as email/duplicate.
                    // - Else if the cell is in an "email column" and is non-empty,
                    //   flag the trimmed cell value as invalid.
                    //   Only skip the first non-empty cell as a header when it
                    //   matches a known header keyword (so junk like
                    //   "saidheeraj123" gets flagged, not silently swallowed).
                    const headerSeen = {}; // colIndex -> true (we have evaluated row 1)
                    for (let r = 0; r < rows.length; r++) {
                        const row = rows[r] || [];
                        for (let c = 0; c < row.length; c++) {
                            const cellRaw  = row[c];
                            const cellText = String(cellRaw == null ? '' : cellRaw);
                            const trimmed  = cellText.trim();
                            if (!trimmed) continue;

                            const matched = recordEmail(cellText);
                            if (matched) continue;

                            // Cell didn't yield any email. Is it in an email column?
                            if (!colHasEmail[c]) continue;

                            // First non-empty cell in this column: is it a real header?
                            if (!headerSeen[c]) {
                                headerSeen[c] = true;
                                if (looksLikeHeaderRow(trimmed)) continue;
                            }

                            recordInvalid(trimmed);
                        }
                    }
                }
                resolve({ emails, duplicates, invalid });
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error(reader.error && reader.error.message || 'read error'));
        reader.readAsArrayBuffer(file);
    }));
}

/** Common UI update after parsing any file type. */
function applyParsedEmails(emails, fileName, duplicates, invalid) {
    const labelText = document.getElementById('fileLabelText');
    const uploadBtn = document.getElementById('uploadBtn');
    const removeBtn = document.getElementById('removeBtn');
    const clearBtn  = document.getElementById('clearFileBtn');
    pendingFileEmails = emails || [];
    duplicates = duplicates || [];
    invalid = invalid || [];
    const dupCount = duplicates.length;
    const invCount = invalid.length;

    if (pendingFileEmails.length === 0) {
        const skippedNote = invCount > 0 ? ` ${invCount} invalid line(s) skipped.` : '';
        showEmailStatus(`No valid emails found in "${fileName}".${skippedNote}`, 'error');
        if (uploadBtn) uploadBtn.disabled = true;
        if (removeBtn) removeBtn.disabled = true;
        labelText.textContent = `${fileName} (0 emails)`;
    } else {
        const skipBits = [];
        if (dupCount > 0) skipBits.push(`${dupCount} duplicate`);
        if (invCount > 0) skipBits.push(`${invCount} invalid`);
        const skippedNote = skipBits.length ? `, ${skipBits.join(', ')} skipped` : '';
        showEmailStatus(
            `✓ Found ${pendingFileEmails.length} email(s) in "${fileName}"${skippedNote}. Click "Add" to add them or "Remove" to delete them.`,
            'success'
        );
        if (uploadBtn) uploadBtn.disabled = false;
        if (removeBtn) removeBtn.disabled = false;
        labelText.textContent = `${fileName} (${pendingFileEmails.length} emails)`;
    }
    clearBtn.style.display = 'inline-block';

    // Show "what got skipped from this file" panel
    renderUploadDetails({ duplicates, invalid });
}

/**
 * Render the duplicate / invalid / not-found details panel.
 * Any list may be empty; the panel hides itself when all are empty.
 * Items are deduplicated for display so the user sees each entry once.
 */
function renderUploadDetails({ duplicates = [], invalid = [], serverDuplicates = [], notFound = [] } = {}) {
    const panel       = document.getElementById('uploadDetailsPanel');
    const dupSection  = document.getElementById('duplicateDetailsSection');
    const invSection  = document.getElementById('invalidDetailsSection');
    const nfSection   = document.getElementById('notFoundDetailsSection');
    const dupList     = document.getElementById('duplicateDetailsList');
    const invList     = document.getElementById('invalidDetailsList');
    const nfList      = document.getElementById('notFoundDetailsList');
    const dupCountEl  = document.getElementById('duplicateDetailsCount');
    const invCountEl  = document.getElementById('invalidDetailsCount');
    const nfCountEl   = document.getElementById('notFoundDetailsCount');

    // Combine within-file duplicates with server-reported duplicates (already-existing emails)
    const allDuplicates = [...duplicates, ...serverDuplicates];
    const uniqDuplicates = dedupCaseInsensitive(allDuplicates);
    const uniqInvalid    = dedupCaseInsensitive(invalid);
    const uniqNotFound   = dedupCaseInsensitive(notFound);

    if (uniqDuplicates.length === 0 && uniqInvalid.length === 0 && uniqNotFound.length === 0) {
        panel.style.display = 'none';
        dupSection.style.display = 'none';
        invSection.style.display = 'none';
        if (nfSection) nfSection.style.display = 'none';
        dupList.innerHTML = '';
        invList.innerHTML = '';
        if (nfList) nfList.innerHTML = '';
        return;
    }

    panel.style.display = 'block';

    if (uniqDuplicates.length > 0) {
        dupSection.style.display = 'block';
        dupCountEl.textContent = uniqDuplicates.length;
        dupList.innerHTML = uniqDuplicates.map(e => `<li>${escapeHtml(e)}</li>`).join('');
    } else {
        dupSection.style.display = 'none';
        dupList.innerHTML = '';
    }

    if (uniqInvalid.length > 0) {
        invSection.style.display = 'block';
        invCountEl.textContent = uniqInvalid.length;
        invList.innerHTML = uniqInvalid.map(e => `<li>${escapeHtml(e)}</li>`).join('');
    } else {
        invSection.style.display = 'none';
        invList.innerHTML = '';
    }

    if (nfSection && nfList && nfCountEl) {
        if (uniqNotFound.length > 0) {
            nfSection.style.display = 'block';
            nfCountEl.textContent = uniqNotFound.length;
            nfList.innerHTML = uniqNotFound.map(e => `<li>${escapeHtml(e)}</li>`).join('');
        } else {
            nfSection.style.display = 'none';
            nfList.innerHTML = '';
        }
    }
}

function dedupCaseInsensitive(arr) {
    const seen = new Set();
    const out = [];
    for (const item of arr || []) {
        const key = String(item || '').toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(item);
    }
    return out;
}

function clearEmailFile() {
    const fileInput = document.getElementById('emailFileInput');
    const labelText = document.getElementById('fileLabelText');
    const uploadBtn = document.getElementById('uploadBtn');
    const removeBtn = document.getElementById('removeBtn');
    const clearBtn  = document.getElementById('clearFileBtn');
    if (fileInput) fileInput.value = '';
    if (labelText) labelText.textContent = '';
    if (uploadBtn) uploadBtn.disabled = true;
    if (removeBtn) removeBtn.disabled = true;
    if (clearBtn)  clearBtn.style.display = 'none';
    pendingFileEmails = [];
    // Hide the duplicate / invalid details panel
    const panel = document.getElementById('uploadDetailsPanel');
    if (panel) panel.style.display = 'none';
}

/** Like clearEmailFile but leaves the details panel visible — used after a
 *  successful upload so the user can still see which addresses were
 *  duplicates / invalid / not-found. */
function resetFilePickerOnly() {
    const fileInput = document.getElementById('emailFileInput');
    const labelText = document.getElementById('fileLabelText');
    const uploadBtn = document.getElementById('uploadBtn');
    const removeBtn = document.getElementById('removeBtn');
    const clearBtn  = document.getElementById('clearFileBtn');
    if (fileInput) fileInput.value = '';
    if (labelText) labelText.textContent = '';
    if (uploadBtn) uploadBtn.disabled = true;
    if (removeBtn) removeBtn.disabled = true;
    if (clearBtn)  clearBtn.style.display = 'none';
    pendingFileEmails = [];
}

/**
 * Parse emails out of CSV/TXT text.
 * - Splits on newlines AND on commas/semicolons/spaces (so a single line with
 *   "a@x.com, b@x.com" works, and a CSV row also works).
 * - Detects and skips a header line if it looks like a column header
 *   (i.e. doesn't contain "@").
 * - Also skips quoted "email" headers, BOM, and empty lines.
 *
 * Returns { emails, duplicates, invalid }: emails are unique valid addresses,
 * duplicates are repeated addresses encountered within the file, and invalid
 * are tokens that look like an email attempt but failed validation.
 */
function parseEmailsFromText(text) {
    if (!text) return { emails: [], duplicates: [], invalid: [] };
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const lines = text.split(/\r?\n/);
    const found = [];
    const seenLower = new Set();
    const duplicates = [];
    const invalid = [];
    const seenInvalidLower = new Set();

    const recordValid = (tok) => {
        const lower = tok.toLowerCase();
        if (seenLower.has(lower)) duplicates.push(tok);
        else { seenLower.add(lower); found.push(tok); }
    };
    const recordInvalid = (tok) => {
        const lower = tok.toLowerCase();
        if (!seenInvalidLower.has(lower)) {
            seenInvalidLower.add(lower);
            invalid.push(tok);
        }
    };

    // Look at the first non-empty line. If it looks like a multi-column CSV header
    // with an "email" column at a specific index, route data to that column only.
    let emailColumnIndex = -1; // -1 means "no column-aware mode"
    let firstDataLineIndex = -1;
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (!trimmed) continue;
        const cols = splitCsvLine(trimmed);
        if (cols.length >= 2) {
            const lowerCols = cols.map(c => c.replace(/^["']|["']$/g, '').trim().toLowerCase());
            const allHeaderish = lowerCols.every(c => HEADER_WORDS.has(c));
            const idx = lowerCols.findIndex(c => c === 'email' || c === 'emails' || c === 'e-mail' || c === 'mail' || c === 'email address' || c === 'emailaddress' || c === 'email_address');
            if (allHeaderish && idx >= 0) {
                emailColumnIndex = idx;
                firstDataLineIndex = i + 1;
                break;
            }
        }
        firstDataLineIndex = i; // first non-empty wasn't a multi-col header
        break;
    }

    if (emailColumnIndex >= 0) {
        // Column-aware: only inspect cells in that column. Flag invalid only if the
        // cell is non-empty in that specific column.
        for (let i = firstDataLineIndex; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const cols = splitCsvLine(line);
            const cell = (cols[emailColumnIndex] || '').replace(/^["']|["']$/g, '').trim();
            if (!cell) continue;
            if (emailRegex.test(cell)) recordValid(cell);
            else recordInvalid(cell);
        }
        return { emails: found, duplicates, invalid };
    }

    // Single-column / unstructured fallback: treat every token on every line
    // as an email attempt. Skip a literal "email" header line.
    let firstNonEmpty = true;
    for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        if (firstNonEmpty) {
            firstNonEmpty = false;
            if (looksLikeHeaderRow(line)) continue;
        }

        const tokens = line.split(/[,;\s\t]+/);
        for (let tok of tokens) {
            tok = tok.replace(/^["']|["']$/g, '').trim();
            if (!tok) continue;
            if (emailRegex.test(tok)) recordValid(tok);
            else recordInvalid(tok);
        }
    }
    return { emails: found, duplicates, invalid };
}

/**
 * Split a CSV line on commas (or tabs / semicolons). Naive: doesn't fully handle
 * quoted commas, but good enough for one-email-per-row spreadsheets exported
 * from Excel/Google Sheets.
 */
function splitCsvLine(line) {
    return line.split(/[,;\t]/);
}

const HEADER_WORDS = new Set([
    'email', 'emails', 'email address', 'emailaddress', 'email_address',
    'e-mail', 'mail', 'address',
    'name', 'full name', 'fullname', 'first name', 'last name',
    'phone', 'mobile', 'contact', 'id', 'sl', 'sno', 's.no', 'sl.no',
    'role', 'department', 'title', 'company', 'notes', 'comments',
    'designation', 'location', 'team'
]);

/**
 * Decide whether a line looks like a column-header row rather than data.
 * We only skip when EVERY token on the line is a well-known header keyword,
 * so that a single garbage word like "saidheeraj123" is still flagged as
 * invalid email data instead of being silently swallowed.
 */
function looksLikeHeaderRow(line) {
    const tokens = line.split(/[,;\t]+/).map(t => t.replace(/^["']|["']$/g, '').trim().toLowerCase()).filter(Boolean);
    if (tokens.length === 0) return false;
    return tokens.every(t => HEADER_WORDS.has(t));
}

async function uploadEmailFile() {
    if (!pendingFileEmails || pendingFileEmails.length === 0) {
        showEmailStatus('No emails to upload. Please choose a file first.', 'error');
        return;
    }
    const url = currentEmailType === 'candidate'
        ? '/api/candidate-emails/bulk-add'
        : '/api/panelist-emails/bulk-add';

    const uploadBtn = document.getElementById('uploadBtn');
    const removeBtn = document.getElementById('removeBtn');
    uploadBtn.disabled = true;
    if (removeBtn) removeBtn.disabled = true;
    showEmailStatus('Uploading...', '');

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ emails: pendingFileEmails })
        });
        let data = {};
        try { data = await res.json(); } catch (_) { /* non-json response */ }
        if (!res.ok) {
            let msg;
            if (res.status === 404) {
                msg = 'Bulk upload endpoint not available on this server. Please restart the server (stop & re-run "node src/server.js") so the new endpoints load.';
            } else {
                msg = data.error || `Bulk add failed (HTTP ${res.status}).`;
            }
            showEmailStatus(msg, 'error');
            uploadBtn.disabled = false;
            if (removeBtn) removeBtn.disabled = false;
            return;
        }

        // Build a friendly multi-line status message
        const parts = [`✓ Added ${data.addedCount || 0} new email(s).`];
        if (data.duplicateCount > 0) parts.push(`${data.duplicateCount} duplicate(s) skipped.`);
        if (data.invalidCount > 0)   parts.push(`${data.invalidCount} invalid skipped.`);
        showEmailStatus(parts.join(' '), data.addedCount > 0 ? 'success' : 'error');

        // Show server-reported duplicates + invalid in the details panel
        renderUploadDetails({
            duplicates: [],
            invalid: Array.isArray(data.invalid) ? data.invalid : [],
            serverDuplicates: Array.isArray(data.duplicates) ? data.duplicates : []
        });

        resetFilePickerOnly();
        await loadEmailList();
    } catch (err) {
        showEmailStatus('Network error: ' + err.message, 'error');
        uploadBtn.disabled = false;
        if (removeBtn) removeBtn.disabled = false;
    }
}

/**
 * Bulk-remove emails listed in the chosen file. Same semantics as the per-row
 * Remove button, but operates on every email parsed from the uploaded file.
 * Asks for confirmation, then sends to /bulk-remove and shows a result panel
 * with what was removed, what wasn't found, and what was rejected as invalid.
 */
async function removeEmailFile() {
    if (!pendingFileEmails || pendingFileEmails.length === 0) {
        showEmailStatus('No emails to remove. Please choose a file first.', 'error');
        return;
    }
    const label = currentEmailType === 'candidate' ? 'candidate' : 'panelist';
    if (!confirm(`Remove all ${pendingFileEmails.length} ${label} email(s) listed in this file?\n\nThis action cannot be undone.`)) {
        return;
    }

    const url = currentEmailType === 'candidate'
        ? '/api/candidate-emails/bulk-remove'
        : '/api/panelist-emails/bulk-remove';

    const uploadBtn = document.getElementById('uploadBtn');
    const removeBtn = document.getElementById('removeBtn');
    uploadBtn.disabled = true;
    if (removeBtn) removeBtn.disabled = true;
    showEmailStatus('Removing...', '');

    const requesterEmail = (localStorage.getItem('candidateId') || '').trim().toLowerCase();

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ emails: pendingFileEmails, requesterEmail })
        });
        let data = {};
        try { data = await res.json(); } catch (_) { /* non-json response */ }
        if (!res.ok) {
            let msg;
            if (res.status === 404) {
                msg = 'Bulk remove endpoint not available on this server. Please restart the server (stop & re-run "node src/server.js") so the new endpoints load.';
            } else {
                msg = data.error || `Bulk remove failed (HTTP ${res.status}).`;
            }
            showEmailStatus(msg, 'error');
            uploadBtn.disabled = false;
            if (removeBtn) removeBtn.disabled = false;
            return;
        }

        // Build a friendly result message
        const parts = [`✓ Removed ${data.removedCount || 0} email(s).`];
        if (data.notFoundCount > 0)   parts.push(`${data.notFoundCount} not found.`);
        if (data.invalidCount > 0)    parts.push(`${data.invalidCount} invalid skipped.`);
        if (data.skippedSelf && data.skippedSelf.length > 0) {
            parts.push('Your own email was skipped for safety.');
        }
        showEmailStatus(parts.join(' '), data.removedCount > 0 ? 'success' : 'error');

        // Server-reported "not found" and "invalid" go into the details panel
        renderUploadDetails({
            duplicates: [],
            invalid: Array.isArray(data.invalid) ? data.invalid : [],
            notFound: Array.isArray(data.notFound) ? data.notFound : []
        });

        resetFilePickerOnly();
        await loadEmailList();
    } catch (err) {
        showEmailStatus('Network error: ' + err.message, 'error');
        uploadBtn.disabled = false;
        if (removeBtn) removeBtn.disabled = false;
    }
}
