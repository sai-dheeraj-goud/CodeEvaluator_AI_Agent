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
