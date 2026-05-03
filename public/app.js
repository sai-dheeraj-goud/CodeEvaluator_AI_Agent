// ====================================================================
// CONFIGURATION — All settings live in data/config.js.
// They are loaded from the server via /api/config at startup.
// To change values, edit data/config.js and restart the server.
// DO NOT put values here — they are populated automatically by init().
// ====================================================================
const CONFIG = {};
// ====================================================================

// ==================== GLOBAL STATE ====================
let allQuestions = [];
let selectedQuestions = [];
let currentQuestionIndex = 0;
let programsCompleted = 0;
let results = [];
let totalPrograms = 0;
let totalAvailableQuestions = 0;
let codeExecutedForCurrentQuestion = false;
let lastAgentSuggestion = null;
let lastExecutionError = null;
let lastRunResult = null;
let agentRunning = false;
let agentAbortController = null;
let codeState = {};
let outputState = {};
let agentState = {};
let agentTotalAsks = 0;
let agentModeCounts = { percentage: 0 };
let lastAgentPercentage = null;
let savedAgentPercentages = {};
let savedAgentLanguages = {};
let savedAgentFullResults = {};
let savedAgentCodeSnapshots = {};
let savedAgentCodeForReview = {};
let bulkAnalysisResult = null;
let bulkAnalysisRenderedHtml = '';
let bulkAnalysisRunCount = 0;
let personName = '';
let authToken = '';
let tabSwitchCount = 0;
let tabSwitchInProgress = false;
let authEmail = '';
let questionTimeLeft = {};
let experienceYears = 0;
let experienceRaw = '0.0';
let maxExperienceYears = 20;
let experienceTiers = [];
let typingMetrics = {};
let totalElapsedSeconds = 0;
let totalTimeRemaining = 0;
let currentLanguage = 'java';
let lockedLanguage = null;          // Set once on Q1 language choice; locks all subsequent questions
let sessionTimerInterval = null;
let questionTimerInterval = null;
let autoSaveInterval = null;
let assessmentSubmitted = false;
let internalClipboard = '';
let questionCompletionTimes = {};
let candidateLocation = '';

// ==================== HELPER: IST TIMESTAMP ====================
function getISTTimestamp() {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffset);
    const isoString = istDate.toISOString();
    return isoString.replace('Z', '+05:30');
}

// ==================== HELPER: VALIDATION ====================
function validateExperienceInput(value) {
    // Accept formats: "5" (natural number) or "5.6" (with decimal representing months 0-11)
    // Minimum experience must be more than 1 year (e.g., 1.1 = 1 year 1 month)
    const parts = value.split('.');
    if (parts.length === 1) {
        // Natural number format (e.g., "5")
        const years = parseInt(parts[0]);
        if (isNaN(years) || years <= 1 || years > maxExperienceYears) {
            return { valid: false };
        }
        return { valid: true, years: years };
    } else if (parts.length === 2) {
        // Decimal format (e.g., "5.6" where 5 is years, decimal part represents months 0-11)
        const years = parseInt(parts[0]);
        const months = parseInt(parts[1]);
        if (isNaN(years) || isNaN(months) || years < 0 || years > maxExperienceYears || months < 0 || months > 11) {
            return { valid: false };
        }
        // Total experience must be more than 1 year
        const totalYears = years + months / 12;
        if (totalYears <= 1) {
            return { valid: false };
        }
        return { valid: true, years: totalYears };
    }
    return { valid: false };
}

// ==================== HELPER: TYPING METRICS ====================
function initTypingMetrics(questionId) {
    if (typingMetrics[questionId]) return; // Don't reinitialize if already exists
    typingMetrics[questionId] = {
        // === Core keystroke tracking ===
        keystrokes: 0,                    // Total individual key presses (+input, +delete)
        totalCharsTyped: 0,               // Cumulative chars from all change events
        deletionCount: 0,                 // How many delete/backspace operations

        // === Burst detection (paste / large inserts) ===
        bursts: [],                       // Array of { charsAdded: number, timestamp: number }

        // === Tab switch tracking ===
        tabSwitchCodeDiffs: [],           // Array of integers: chars gained after each tab switch
        codeSnapshotBeforeTabSwitch: '',  // Code snapshot when user leaves tab
        tabSwitchTimestamps: [],          // Timestamp of each tab-return event
        charsAfterEachTabSwitch: [],      // Chars added after each tab switch

        // === Timing ===
        startTime: Date.now(),            // When tracking started for this question

        // === Pause detection ===
        lastKeystrokeTime: 0,             // Timestamp of the most recent keystroke
        pauseCount: 0,                    // Number of gaps > 3 seconds between keystrokes
        totalPauseDuration: 0,            // Sum of all pause durations in milliseconds
        pauseDurations: [],               // Array of individual pause durations (ms)

        // === Keystroke timestamps (rolling window) ===
        keystrokeTimestamps: [],          // Last 100 keystroke timestamps for speed analysis

        // === Typing session chunks (between pauses) ===
        typingSessionChunks: [],          // Array of chars typed in each continuous session
        currentSessionChars: 0,           // Chars typed in current session (reset on 3s+ pause)

        // === Cursor / line tracking ===
        cursorLineChanges: [],            // Array of line numbers where edits happened (max 200)

        // === Mouse tracking ===
        mouseMovements: 0,                // Total mouse move events on editor
        mouseMovementTimestamps: [],      // Rolling window (max 50) of mouse move timestamps

        // === Reserved ===
        typingBursts: [],                 // Reserved for future burst analysis
    };
}

function computeAILikelihood(questionId, finalCode, templateCode) {
    const m = typingMetrics[questionId];
    if (!m) return { score: 0, reasons: ['No tracking data'] };

    const totalCodeLen = (finalCode || '').trim().length;
    const templateLen = (templateCode || '').trim().length;
    const codeChanged = finalCode.trim() !== (templateCode || '').trim();

    if (totalCodeLen <= 10 || !codeChanged) return { score: 0, reasons: ['Minimal code written'] };

    // --- Calculate actual code delta: how much the user actually changed from the template ---
    // Use Levenshtein-like rough delta: difference in length + changed content estimate
    const codeDelta = Math.abs(totalCodeLen - templateLen);
    // Compare lines to estimate how much was actually modified
    const finalLines = (finalCode || '').trim().split('\n');
    const templateLines = (templateCode || '').trim().split('\n');
    let changedChars = 0;
    const maxLines = Math.max(finalLines.length, templateLines.length);
    for (let i = 0; i < maxLines; i++) {
        const fl = (finalLines[i] || '').trim();
        const tl = (templateLines[i] || '').trim();
        if (fl !== tl) changedChars += Math.max(fl.length, tl.length);
    }
    // The actual amount the user needed to type = changed characters from template
    // Minimum of codeDelta or changedChars, but at least codeDelta to catch full replacements
    const actualCodeWritten = Math.max(changedChars, codeDelta, 20);

    // For burst/paste detection that might replace the entire template, use total code length
    const codeForBurstDetection = totalCodeLen;

    // --- Template proximity: how similar is the final code to the template? ---
    // If final code is very close to template, user made minimal changes — reduce suspicion
    const templateSimilarity = templateLen > 0 ? 1 - (changedChars / Math.max(totalCodeLen, templateLen)) : 0;
    // templateSimilarity: 1.0 = identical to template, 0.0 = completely different
    const isMinimalEdit = templateSimilarity > 0.7; // >70% of code unchanged from template

    const reasons = [];
    let score = 0;

    // --- Determine if enough NEW code was written for behavioral signals to be meaningful ---
    // Use actualCodeWritten (delta) not totalCodeLen, so template code doesn't inflate this
    const enoughForBehavior = actualCodeWritten > 100 && m.keystrokes > 50;

    // --- Track whether we have hard evidence of paste/copy (bursts, tab switches) ---
    let hasPasteEvidence = false;

    // 1. Keystroke ratio: keystrokes vs ACTUAL code changes (not total code length)
    //    Each keystroke can produce ~1.5-2 chars due to auto-close brackets, auto-indent,
    //    and Enter key generating whitespace. So a ratio of 0.3-0.5 is normal for manual typing.
    const keystrokeRatio = m.keystrokes > 0 ? m.keystrokes / actualCodeWritten : 0;
    if (keystrokeRatio < 0.05 && actualCodeWritten > 80) {
        // Near-zero keystrokes for substantial NEW code = definitive paste
        score += 80;
        hasPasteEvidence = true;
        reasons.push(`Code pasted entirely — near-zero keystrokes for ${actualCodeWritten} characters of changes`);
    } else if (keystrokeRatio < 0.15 && actualCodeWritten > 60) {
        score += 40;
        hasPasteEvidence = true;
        reasons.push('Very few keystrokes relative to code changes (likely pasted from external source)');
    } else if (keystrokeRatio < 0.25 && actualCodeWritten > 60) {
        score += 20;
        hasPasteEvidence = true;
        reasons.push('Fewer keystrokes than expected for the amount of code changed');
    }
    // Note: ratios >= 0.25 are normal for manual typing (auto-brackets, auto-indent, etc.)

    // 2. Burst detection: large code chunks appearing at once (>80 chars in one change)
    const largeBursts = m.bursts.filter(b => b.charsAdded > 80);
    const totalBurstChars = largeBursts.reduce((sum, b) => sum + b.charsAdded, 0);
    if (largeBursts.length >= 5) {
        score += Math.min(largeBursts.length * 10, 30);
        hasPasteEvidence = true;
        reasons.push(`${largeBursts.length} large code burst(s) detected (>80 chars at once, ${totalBurstChars} characters total)`);
    } else if (largeBursts.length >= 3) {
        score += Math.min(largeBursts.length * 8, 20);
        hasPasteEvidence = true;
        reasons.push(`${largeBursts.length} large code burst(s) (>80 chars) — likely pasted from external source (${totalBurstChars} characters total)`);
    }

    // Combo: low keystroke ratio + bursts = very strong paste signal
    if (largeBursts.length >= 3 && keystrokeRatio < 0.15) {
        score += 20;
        reasons.push('Paste confirmed: low keystroke ratio combined with large code bursts');
    } else if (largeBursts.length >= 3 && keystrokeRatio < 0.25) {
        score += 10;
        reasons.push('Likely paste: low keystroke ratio with multiple code bursts');
    }

    // 3. Code appeared after tab switch (>30 chars gained)
    const significantDiffs = m.tabSwitchCodeDiffs.filter(d => d > 30);
    if (significantDiffs.length > 0) {
        score += Math.min(significantDiffs.length * 15, 35);
        hasPasteEvidence = true;
        reasons.push(`Large code changes after ${significantDiffs.length} tab switch(es) — code likely copied from another tab`);
    }

    // Combo: tab switches with significant code diffs + low keystroke ratio = copy-paste via tab switching
    if (significantDiffs.length >= 1 && keystrokeRatio < 0.15) {
        score += 20;
        reasons.push('Copy-paste via tab switch: code appeared after switching tabs with very few keystrokes');
    } else if (significantDiffs.length >= 1 && keystrokeRatio < 0.25) {
        score += 10;
        reasons.push('Probable copy-paste via tab switch: code appeared after switching tabs with low keystrokes');
    }

    // Combo: tab switches with code diffs + large bursts = strong copy-paste evidence
    if (significantDiffs.length >= 1 && largeBursts.length >= 2) {
        score += 15;
        reasons.push(`Tab-switch paste pattern: ${significantDiffs.length} tab switch(es) with code changes + ${largeBursts.length} large code burst(s)`);
    }

    // 4. Typing speed: chars per minute unrealistically high (based on actual delta)
    const elapsedMin = (Date.now() - m.startTime) / 60000;
    if (elapsedMin > 0.1) {
        const cpm = actualCodeWritten / elapsedMin;
        if (cpm > 500) {
            score += 10;
            hasPasteEvidence = true;
            reasons.push(`Unrealistic typing speed (${Math.round(cpm)} chars/min)`);
        }
    }

    // 5. Watch-and-type pattern: frequent tab switches with code added each time
    const switchCount = (m.tabSwitchTimestamps || []).length;
    const charsAfterSwitches = m.charsAfterEachTabSwitch || [];
    const switchesWithCode = charsAfterSwitches.filter(c => c > 5).length;
    if (switchCount >= 3 && switchesWithCode >= 2) {
        score += Math.min(switchesWithCode * 5, 20);
        hasPasteEvidence = true;
        const pct = Math.round((switchesWithCode / switchCount) * 100);
        reasons.push(`Watch-and-type pattern: code added after ${switchesWithCode}/${switchCount} tab switches (${pct}%)`);
    }

    // === BEHAVIORAL SIGNALS (6-13) ===
    // These are weak signals on their own — normal for simple problems and focused coders.
    // They only contribute significantly when combined with paste/copy evidence above.
    // Without paste evidence, behavioral signals are capped at a low contribution.
    let behaviorScore = 0;
    const behaviorReasons = [];

    // 6. Pause-then-type rhythm: long pauses followed by typing
    if (enoughForBehavior && m.pauseCount >= 4) {
        const avgPauseSec = Math.round((m.totalPauseDuration / m.pauseCount) / 1000);
        behaviorScore += Math.min(12, m.pauseCount * 3);
        behaviorReasons.push(`${m.pauseCount} long pauses detected (avg ${avgPauseSec}s)`);
    }

    // 7. High idle ratio: total pause time vs active coding time
    if (enoughForBehavior && elapsedMin > 1 && m.totalPauseDuration > 0) {
        const totalMs = Date.now() - m.startTime;
        const idleRatio = m.totalPauseDuration / totalMs;
        if (idleRatio > 0.5 && m.pauseCount >= 2 && switchCount >= 2) {
            behaviorScore += 8;
            behaviorReasons.push(`High idle ratio (${Math.round(idleRatio * 100)}%) with tab switches — extended reading from external source`);
        }
    }

    // 8. Frequent rapid tab switching: quick back-and-forth
    if (switchCount >= 2) {
        const ts = m.tabSwitchTimestamps;
        let rapidSwitches = 0;
        for (let i = 1; i < ts.length; i++) {
            if (ts[i] - ts[i - 1] < 15000) rapidSwitches++;
        }
        if (rapidSwitches >= 3) {
            behaviorScore += Math.min(12, rapidSwitches * 3);
            hasPasteEvidence = true; // rapid tab switching IS evidence
            behaviorReasons.push(`${rapidSwitches} rapid tab switches (<15s apart) — frequent reference to external source`);
        }
    }

    // 9. Rhythmic pause pattern: consistent pause durations
    const pauseDurations = m.pauseDurations || [];
    if (enoughForBehavior && pauseDurations.length >= 4) {
        const avgPause = pauseDurations.reduce((a, b) => a + b, 0) / pauseDurations.length;
        const variance = pauseDurations.reduce((sum, d) => sum + Math.pow(d - avgPause, 2), 0) / pauseDurations.length;
        const stdDev = Math.sqrt(variance);
        const coeffOfVariation = avgPause > 0 ? stdDev / avgPause : 1;
        if (coeffOfVariation < 0.3) {
            behaviorScore += 10;
            behaviorReasons.push(`Rhythmic pause pattern detected (CV=${coeffOfVariation.toFixed(2)}) — consistent read-type-read cycle from external device`);
        } else if (coeffOfVariation < 0.5 && pauseDurations.length >= 6) {
            behaviorScore += 5;
            behaviorReasons.push(`Semi-regular pause rhythm (CV=${coeffOfVariation.toFixed(2)}) — possible external source reference`);
        }
    }

    // 10. Uniform typing session sizes: similar char counts between pauses
    const sessionChunks = m.typingSessionChunks || [];
    if (enoughForBehavior && sessionChunks.length >= 4) {
        const allChunks = m.currentSessionChars > 0 ? [...sessionChunks, m.currentSessionChars] : sessionChunks;
        if (allChunks.length >= 4) {
            const avgChunk = allChunks.reduce((a, b) => a + b, 0) / allChunks.length;
            const chunkVariance = allChunks.reduce((sum, c) => sum + Math.pow(c - avgChunk, 2), 0) / allChunks.length;
            const chunkCV = avgChunk > 0 ? Math.sqrt(chunkVariance) / avgChunk : 1;
            if (chunkCV < 0.35 && avgChunk > 8) {
                behaviorScore += 8;
                behaviorReasons.push(`Uniform typing chunks (~${Math.round(avgChunk)} chars each, CV=${chunkCV.toFixed(2)}) — likely transcribing from external source`);
            }
        }
    }

    // 11. Low deletion ratio: very few corrections
    //     Normal for simple problems — only flag if combined with other evidence
    if (enoughForBehavior && m.keystrokes > 50) {
        const delRatio = m.deletionCount / m.keystrokes;
        if (delRatio < 0.005) {
            behaviorScore += 6;
            behaviorReasons.push(`Extremely low deletion ratio (${(delRatio * 100).toFixed(1)}%) — almost no corrections`);
        } else if (delRatio < 0.02 && m.keystrokes > 80) {
            behaviorScore += 3;
            behaviorReasons.push(`Very low deletion ratio (${(delRatio * 100).toFixed(1)}%) — fewer corrections than typical`);
        }
    }

    // 12. Linear code entry: strictly top-to-bottom without jumping back
    //     Normal for simple/short solutions — only flag for longer code
    const lineChanges = m.cursorLineChanges || [];
    if (enoughForBehavior && lineChanges.length >= 20) {
        let backJumps = 0;
        for (let i = 1; i < lineChanges.length; i++) {
            if (lineChanges[i] < lineChanges[i - 1] - 1) backJumps++;
        }
        const backJumpRatio = backJumps / (lineChanges.length - 1);
        if (backJumpRatio < 0.03) {
            behaviorScore += 6;
            behaviorReasons.push(`Strictly linear code entry (${(backJumpRatio * 100).toFixed(1)}% back-jumps) — code written top-to-bottom like transcription`);
        }
    }

    // 13. Mouse inactivity during active typing
    //     Normal for keyboard-focused coders — only flag for extended sessions
    if (enoughForBehavior && m.keystrokes > 50 && elapsedMin > 2) {
        const mousePerKeystroke = m.mouseMovements / m.keystrokes;
        if (mousePerKeystroke < 0.02) {
            behaviorScore += 6;
            behaviorReasons.push(`Near-zero mouse activity during typing (${m.mouseMovements} moves / ${m.keystrokes} keystrokes) — eyes likely on external device`);
        } else if (mousePerKeystroke < 0.08 && m.keystrokes > 80) {
            behaviorScore += 3;
            behaviorReasons.push(`Very low mouse activity during typing — possible external device reference`);
        }
    }

    // === Apply behavioral signals with appropriate weighting ===
    if (hasPasteEvidence) {
        // With paste/copy evidence, behavioral signals reinforce the case — add full amount
        score += behaviorScore;
        reasons.push(...behaviorReasons);
    } else if (behaviorScore > 0) {
        // Without paste/copy evidence, behavioral signals alone are weak indicators
        // Cap their contribution to prevent false positives on manually-typed simple code
        const cappedBehavior = Math.min(behaviorScore, 15);
        score += cappedBehavior;
        reasons.push(...behaviorReasons);
    }

    // === Template proximity discount ===
    // If the final code is very similar to the template (user made minimal changes),
    // reduce the score since there wasn't much to actually type/paste
    if (isMinimalEdit && !hasPasteEvidence) {
        const discount = Math.round(score * 0.5);
        if (discount > 0) {
            score = Math.max(0, score - discount);
            reasons.push(`Template similarity discount applied — code is ${Math.round(templateSimilarity * 100)}% similar to provided template`);
        }
    }

    score = Math.min(100, score); // Cap at 100%
    if (reasons.length === 0) reasons.push('Typing patterns appear normal');
    return { score, reasons };
}

// ==================== HELPER: API CALLS ====================
async function apiCall(method, endpoint, body = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
        }
    };

    if (body) options.body = JSON.stringify(body);

    try {
        const response = await fetch(endpoint, options);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'API error');
        return data;
    } catch (err) {
        throw err;
    }
}

// ==================== HELPER: UI UTILITIES ====================
function showStep(stepNumber) {
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
    document.getElementById(`step-${stepNumber}`).classList.add('active');
    window.scrollTo(0, 0);

    // Show floating feedback widget only on the results/performance summary page (step 4)
    const feedbackWidget = document.getElementById('feedbackWidget');
    if (feedbackWidget) {
        if (stepNumber === 4) {
            feedbackWidget.classList.remove('hidden');
        } else {
            feedbackWidget.classList.add('hidden');
            const form = document.getElementById('feedbackFormContainer');
            if (form) form.classList.add('hidden');
        }
    }
}

function showLoading(show, text = 'Loading...') {
    const overlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');
    loadingText.textContent = text;
    overlay.classList.toggle('hidden', !show);
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.getElementById('toastContainer').appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function playTimerAlert() {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25, 0.5].forEach(delay => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.frequency.value = 880; osc.type = 'sine'; gain.gain.value = 0.3;
        osc.start(audioCtx.currentTime + delay);
        osc.stop(audioCtx.currentTime + delay + 0.15);
    });
}

function playTabSwitchAlert() {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.linearRampToValueAtTime(900, t + 0.15);
    osc.frequency.linearRampToValueAtTime(400, t + 0.3);
    osc.frequency.linearRampToValueAtTime(900, t + 0.45);
    osc.frequency.linearRampToValueAtTime(400, t + 0.6);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.setValueAtTime(0.3, t + 0.55);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    osc.start(t); osc.stop(t + 0.6);
}

function playTimerBeep() {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.frequency.value = 1000; osc.type = 'square'; gain.gain.value = 0.25;
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.1);
}

// ==================== SESSION MANAGEMENT ====================
function saveSession() {
    // Patch: Set per-question tabSwitchCount before saving/submitting
    if (Array.isArray(results)) {
        results.forEach(r => {
            if (r && r.questionId !== undefined && typingMetrics[r.questionId]) {
                r.tabSwitchCount = (typingMetrics[r.questionId].tabSwitchTimestamps || []).length;
            }
        });
    }
    const sessionData = {
        personName,
        authToken,
        authEmail,
        candidateLocation,
        experienceYears,
        experienceRaw,
        currentQuestionIndex,
        selectedQuestions,
        codeState,
        outputState,
        agentState,
        results,
        tabSwitchCount,
        totalElapsedSeconds,
        typingMetrics,
        savedAgentPercentages,
        savedAgentLanguages,
        savedAgentFullResults,
        savedAgentCodeSnapshots,
        savedAgentCodeForReview,
        lockedLanguage,
        questionCompletionTimes,
        questionTimeLeft,
        totalPrograms,
        bulkAnalysisResult,
        bulkAnalysisRenderedHtml,
        savedAt: Date.now()
    };
    localStorage.setItem('codeEvaluatorSession', JSON.stringify(sessionData));
}

function loadSession() {
    const saved = localStorage.getItem('codeEvaluatorSession');
    if (!saved) return null;
    
    try {
        const data = JSON.parse(saved);
        const ageMs = Date.now() - data.savedAt;
        if (ageMs > 2 * 60 * 60 * 1000) return null; // 2 hours
        return data;
    } catch {
        return null;
    }
}

function clearSession() {
    localStorage.removeItem('codeEvaluatorSession');
}

// ==================== LOGIN / OTP ====================
async function fetchTotalQuestionCount() {
    try {
        const data = await apiCall('GET', '/api/questions');
        totalAvailableQuestions = data.questions.length;
    } catch (err) {
        console.error('Failed to fetch question count:', err);
    }
}

document.getElementById('sendOtpBtn').addEventListener('click', async () => {
    const email = document.getElementById('emailInput').value.trim();
    if (!email) {
        document.getElementById('loginStatus').textContent = 'Please enter an email';
        return;
    }

    // Clear previous error styling
    const loginStatus = document.getElementById('loginStatus');
    loginStatus.textContent = '';
    loginStatus.style.color = '#d32f2f';

    showLoading(true, 'Sending OTP...');
    try {
        await apiCall('POST', '/api/auth/send-otp', { email });
        document.getElementById('emailForm').style.display = 'none';
        document.getElementById('otpForm').style.display = 'block';
        document.getElementById('otpEmail').textContent = email;
        document.getElementById('otpInput').focus();
        showToast('OTP sent successfully', 'success');
    } catch (err) {
        const msg = err.message || 'Unknown error';
        // Show authorization errors prominently
        if (msg.includes('not authorized')) {
            loginStatus.innerHTML = `<div style="background:#fff3f3;border:1px solid #d32f2f;border-radius:8px;padding:14px 18px;margin-top:10px;text-align:center;">
                <span style="font-size:1.5em;">🚫</span><br>
                <strong style="color:#d32f2f;font-size:1.05em;">${msg}</strong>
            </div>`;
        } else {
            loginStatus.textContent = `Error: ${msg}`;
        }
    } finally {
        showLoading(false);
    }
});

// Add Enter key support for email input
document.getElementById('emailInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('sendOtpBtn').click();
    }
});

document.getElementById('verifyOtpBtn').addEventListener('click', async () => {
    const email = document.getElementById('otpEmail').textContent;
    const otp = document.getElementById('otpInput').value;
    
    if (otp.length !== 6) {
        document.getElementById('loginStatus').textContent = 'Please enter a 6-digit OTP';
        return;
    }

    showLoading(true, 'Verifying OTP...');
    try {
        const result = await apiCall('POST', '/api/auth/verify-otp', { email, otp });
        authToken = result.token;
        authEmail = result.email;
        sessionStorage.setItem('authToken', authToken);
        sessionStorage.setItem('authEmail', authEmail);
        
        // Store candidate info for panelist access
        localStorage.setItem('candidateId', email);
        localStorage.setItem('candidateName', email);
        // Create a sessionId for panelist dashboard
        const sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('sessionId', sessionId);
        
        await fetchTotalQuestionCount();
        await loadPanelistEmails();
        
        // Check for a saved session matching this email
        const saved = loadSession();
        if (saved && saved.authEmail === email && saved.questionTimeLeft) {
            // Deduct the time that passed while the page was closed
            const elapsedMs = Date.now() - (saved.savedAt || Date.now());
            const elapsedSec = Math.floor(elapsedMs / 1000);
            if (elapsedSec > 0) {
                const currentQ = saved.selectedQuestions[saved.currentQuestionIndex];
                if (currentQ && saved.questionTimeLeft[currentQ.id] !== undefined) {
                    saved.questionTimeLeft[currentQ.id] = Math.max(0, saved.questionTimeLeft[currentQ.id] - elapsedSec);
                }
            }

            const totalTimeRemaining = Object.values(saved.questionTimeLeft).reduce((a, b) => a + b, 0);
            if (totalTimeRemaining > 0) {
                // Show resume dialog
                document.getElementById('resumeDialog').classList.remove('hidden');
                document.getElementById('resumeBtn').onclick = () => {
                    // Restore all saved state
                    personName = saved.personName || '';
                    authToken = result.token;  // use fresh token from this login
                    authEmail = result.email;
                    candidateLocation = saved.candidateLocation || '';
                    experienceYears = saved.experienceYears || 0;
                    experienceRaw = saved.experienceRaw || '0.0';
                    currentQuestionIndex = saved.currentQuestionIndex || 0;
                    selectedQuestions = saved.selectedQuestions || [];
                    codeState = saved.codeState || {};
                    outputState = saved.outputState || {};
                    agentState = saved.agentState || {};
                    results = saved.results || [];
                    tabSwitchCount = saved.tabSwitchCount || 0;
                    totalElapsedSeconds = saved.totalElapsedSeconds || 0;
                    typingMetrics = saved.typingMetrics || {};
                    savedAgentPercentages = saved.savedAgentPercentages || {};
                    savedAgentLanguages = saved.savedAgentLanguages || {};
                    savedAgentFullResults = saved.savedAgentFullResults || {};
                    savedAgentCodeSnapshots = saved.savedAgentCodeSnapshots || {};
                    savedAgentCodeForReview = saved.savedAgentCodeForReview || {};
                    lockedLanguage = saved.lockedLanguage || null;
                    questionCompletionTimes = saved.questionCompletionTimes || {};
                    questionTimeLeft = saved.questionTimeLeft || {};
                    totalPrograms = saved.totalPrograms || 0;
                    bulkAnalysisResult = saved.bulkAnalysisResult || null;
                    bulkAnalysisRenderedHtml = saved.bulkAnalysisRenderedHtml || '';
                    currentLanguage = lockedLanguage || 'java';
                    document.getElementById('resumeDialog').classList.add('hidden');
                    showStep(3);
                    const totalTimerEl = document.getElementById('totalTimer');
                    if (totalTimerEl) { totalTimerEl.classList.remove('hidden'); initDraggableTimer(); }
                    loadQuestion();
                    startQuestionTimer();
                    startAutoSave();
                    startSessionTimer();
                    calculateTotalTime();
                };
                document.getElementById('startFreshBtn').onclick = () => {
                    clearSession();
                    document.getElementById('resumeDialog').classList.add('hidden');
                    showStep(2);
                };
                showLoading(false);
                return; // wait for user choice
            } else {
                clearSession(); // timers expired
            }
        } else if (saved && saved.authEmail && saved.authEmail !== email) {
            // Different email — clear the old session
            clearSession();
        }

        // Show role selection only for panelist-authorized emails
        if (isPanelistEmail(email)) {
            document.getElementById('roleSelectionModal').classList.remove('hidden');
        } else {
            // Non-admin users go straight to candidate dashboard
            showStep(2);
        }
        
        showToast('Login successful', 'success');
    } catch (err) {
        document.getElementById('loginStatus').textContent = `Error: ${err.message}`;
    } finally {
        showLoading(false);
    }
});

// Add Enter key support for OTP input
document.getElementById('otpInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('verifyOtpBtn').click();
    }
});

document.getElementById('resendOtpBtn').addEventListener('click', async () => {
    const email = document.getElementById('otpEmail').textContent;
    showLoading(true, 'Resending OTP...');
    try {
        await apiCall('POST', '/api/auth/send-otp', { email });
        document.getElementById('otpInput').value = '';
        document.getElementById('loginStatus').textContent = '';
        showToast('OTP resent', 'success');
    } catch (err) {
        document.getElementById('loginStatus').textContent = `Error: ${err.message}`;
    } finally {
        showLoading(false);
    }
});

document.getElementById('changeEmailLink').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('emailForm').style.display = 'block';
    document.getElementById('otpForm').style.display = 'none';
    document.getElementById('emailInput').value = '';
    document.getElementById('otpInput').value = '';
    document.getElementById('loginStatus').textContent = '';
    document.getElementById('emailInput').focus();
});

// ==================== STEP 2: CANDIDATE DETAILS ====================
document.getElementById('proceedDetailsBtn').addEventListener('click', async () => {
    const name = document.getElementById('candidateName').value.trim();
    const expInput = document.getElementById('experienceYears').value;
    
    if (!name) {
        showToast('Please enter candidate name', 'error');
        return;
    }

    // Ensure config is loaded BEFORE validation so maxExperienceYears is correct
    if (!experienceTiers || experienceTiers.length === 0) {
        console.log('Loading config before proceeding...');
        try {
            const response = await apiCall('GET', '/api/config');
            maxExperienceYears = response.maxExperienceYears;
            experienceTiers = response.experienceTiers;
            console.log('Config loaded, tiers:', experienceTiers);
        } catch (err) {
            console.error('Failed to load config:', err);
            showToast('Error loading configuration. Please try again.', 'error');
            return;
        }
    }

    const validation = validateExperienceInput(expInput);
    if (!validation.valid) {
        const expEl = document.getElementById('experienceYears');
        expEl.style.border = '2px solid red';
        showToast(`Experience must be more than 1 year and up to ${maxExperienceYears} years. Use decimals for months (e.g., 2.6 = 2 yrs 6 months).`, 'error');
        return;
    }

    // Clear red border on successful validation
    document.getElementById('experienceYears').style.border = '';

    // Validate location
    const locSelect = document.getElementById('candidateLocation');
    if (!locSelect || !locSelect.value) {
        locSelect.style.border = '2px solid red';
        showToast('Please select your location', 'error');
        return;
    }
    locSelect.style.border = '';

    personName = name;
    experienceRaw = expInput;
    experienceYears = validation.years;
    candidateLocation = locSelect.value;

    // Lock the preferred programming language
    const langSelect = document.getElementById('preferredLanguage');
    if (!langSelect || !langSelect.value) {
        langSelect.style.border = '2px solid red';
        showToast('Please select a preferred programming language', 'error');
        return;
    }
    langSelect.style.border = '';
    lockedLanguage = langSelect.value;
    currentLanguage = lockedLanguage;
    console.log('Language locked to:', lockedLanguage, '(from details form)');

    console.log('Proceeding with experience:', experienceYears);
    updateInstructionsDisplay();
    showStep(1);
    startInstructionTimer();
});

function startInstructionTimer() {
    const timerBox = document.getElementById('instructionTimerBox');
    const timerCount = document.getElementById('instructionTimerCount');
    const consentBox = document.getElementById('consentBox');
    const consentCheckbox = document.getElementById('consentCheckbox');
    let secondsLeft = CONFIG.instructionReadTimer;

    // Immediately show the correct value (don't wait for first tick)
    if (timerCount) timerCount.textContent = secondsLeft;

    const interval = setInterval(() => {
        secondsLeft--;
        if (timerCount) timerCount.textContent = secondsLeft;
        if (secondsLeft <= 0) {
            clearInterval(interval);
            // Enable consent box
            if (consentBox) {
                consentBox.style.opacity = '1';
                consentBox.style.pointerEvents = 'auto';
            }
            if (consentCheckbox) consentCheckbox.disabled = false;
            // Hide timer message
            if (timerBox) timerBox.classList.add('hidden');
        }
    }, 1000);
}

// Add Enter key support for candidate name and experience inputs
document.getElementById('candidateName').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('proceedDetailsBtn').click();
    }
});

document.getElementById('experienceYears').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('proceedDetailsBtn').click();
    }
});

// Clear red border when user starts editing the experience field
document.getElementById('experienceYears').addEventListener('input', () => {
    document.getElementById('experienceYears').style.border = '';
});

// ==================== STEP 1: INSTRUCTIONS ====================
function updateInstructionsDisplay() {
    console.log('updateInstructionsDisplay called, experienceYears:', experienceYears, 'tiers:', experienceTiers);
    
    if (!experienceTiers || experienceTiers.length === 0) {
        console.warn('Experience tiers not loaded yet, cannot update instructions');
        return;
    }
    
    const tier = experienceTiers.find(t => experienceYears <= t.maxYears) || experienceTiers[experienceTiers.length - 1];
    
    if (!tier) {
        console.error('No tier found for experience:', experienceYears);
        return;
    }
    
    // Compute timer information from CONFIG.questionTimeLimits and tier
    const questions = tier.questions || {};
    const difficulties = Object.keys(questions);
    let numQuestions = 0;
    let totalTimeSec = 0; // auto-calculated from per-question timers
    for (const d of difficulties) numQuestions += questions[d] || 0;
    
    // Build question description using CONFIG.questionTimeLimits
    let questionDesc = `You will receive <strong>${numQuestions} question${numQuestions > 1 ? 's' : ''}</strong>.`;
    
    let qNum = 1;
    for (const diff of difficulties) {
        const count = questions[diff] || 0;
        const timerSec = CONFIG.questionTimeLimits[diff] || CONFIG.defaultTimeLimit;
        totalTimeSec += timerSec * count;
        const timerDisplay = timerSec >= 60 ? `${Math.round(timerSec / 60)} min` : `${timerSec} sec`;
        for (let j = 0; j < count; j++) {
            questionDesc += ` Question ${qNum}: ${timerDisplay}.`;
            qNum++;
        }
    }
    
    // Display total time (auto-calculated from question timers)
    const totalTimeDisplay = totalTimeSec >= 60 ? `${Math.round(totalTimeSec / 60)} min` : `${totalTimeSec} sec`;
    questionDesc += ` A <strong>total session countdown timer</strong> will be displayed on the top right corner of the screen. Total session time: <strong>${totalTimeDisplay}</strong>.`;
    
    // Update the instruction line
    const line3 = document.getElementById('instructionLine3');
    if (line3) {
        line3.innerHTML = questionDesc;
        console.log('Instructions updated successfully');
    }

    // Update instruction line 5 to reflect the chosen language
    const langDisplay = lockedLanguage === 'java' ? 'Java' : lockedLanguage === 'python' ? 'Python' : 'JavaScript';
    const langIcon = lockedLanguage === 'java' ? '☕' : lockedLanguage === 'python' ? '🐍' : '📜';
    const line5 = document.getElementById('instructionLine5');
    if (line5) {
        line5.innerHTML = `You chose <strong>${langIcon} ${langDisplay}</strong>. Click <strong>"Run Code"</strong> to test your solution against the expected output.`;
    }
    const line6 = document.getElementById('instructionLine6');
    if (line6) {
        line6.innerHTML = `The <strong>Agent Score</strong> is calculated <strong>only in ${langDisplay}</strong> for all questions.`;
    }
}

document.getElementById('consentCheckbox').addEventListener('change', () => {
    const checked = document.getElementById('consentCheckbox').checked;
    document.getElementById('startAssessmentBtn').disabled = !checked;
    const consentBox = document.getElementById('consentBox');
    if (consentBox) {
        if (checked) {
            consentBox.classList.add('checked');
        } else {
            consentBox.classList.remove('checked');
        }
    }
});

document.getElementById('startAssessmentBtn').addEventListener('click', () => {
    if (!document.getElementById('consentCheckbox').checked) return;
    startCodingAssessment();
});

async function startCodingAssessment() {
    showLoading(true, 'Loading questions...');
    try {
        console.log('=== startCodingAssessment START ===');
        console.log('experienceYears:', experienceYears);
        
        // Reset tab switch count for new assessment
        tabSwitchCount = 0;
        tabSwitchInProgress = false;
        
        const data = await apiCall('GET', `/api/questions?experience=${experienceYears}`);
        console.log('API Response:', data);
        
        selectedQuestions = data.questions;
        totalPrograms = selectedQuestions.length;
        
        console.log('selectedQuestions:', selectedQuestions);
        console.log('totalPrograms:', totalPrograms);

        if (totalPrograms === 0) {
            showToast('No questions available for your experience level', 'error');
            showLoading(false);
            return;
        }

        // Get tier for current experience
        const tier = experienceTiers.find(t => experienceYears <= t.maxYears) || experienceTiers[experienceTiers.length - 1];
        
        console.log('Tier:', tier);

        currentQuestionIndex = 0;
        results = selectedQuestions.map(q => {
            const expectedOutput = extractExpectedOutput(q);
            return {
                questionId: q.id,
                questionTitle: q.title,
                status: 'pending',
                language: 'java',
                expectedOutput: expectedOutput,
                actualOutput: '',
                agentScore: null,
                errorMessage: ''
            };
        });

        results.forEach((r, i) => {
            codeState[`q${selectedQuestions[i].id}-java`] = buildJavaStarterTemplate();
            codeState[`q${selectedQuestions[i].id}-python`] = buildPythonStarterTemplate();
            codeState[`q${selectedQuestions[i].id}-javascript`] = buildJavaScriptStarterTemplate();
            outputState[`q${selectedQuestions[i].id}`] = { java: '', python: '', javascript: '' };
            agentState[`q${selectedQuestions[i].id}`] = { java: null, python: null, javascript: null };
            typingMetrics[selectedQuestions[i].id] = null;
            initTypingMetrics(selectedQuestions[i].id);
            
            // Set timer based on question difficulty using CONFIG.questionTimeLimits
            const difficulty = (selectedQuestions[i].difficulty || '').toLowerCase();
            const timerSeconds = CONFIG.questionTimeLimits[difficulty] || CONFIG.defaultTimeLimit;
            questionTimeLeft[selectedQuestions[i].id] = timerSeconds;
        });

        calculateTotalTime();
        console.log('About to showStep(3)...');
        showStep(3);
        
        // Show total timer and make it draggable
        const totalTimerEl = document.getElementById('totalTimer');
        if (totalTimerEl) {
            totalTimerEl.classList.remove('hidden');
            resetTimerPosition();
            initDraggableTimer();
        }
        
        try {
            loadQuestion();
            startQuestionTimer();
            startAutoSave();
            startSessionTimer();
        } catch (err) {
            console.error('Error loading question:', err);
            showToast('Error loading question: ' + err.message, 'error');
        } finally {
            showLoading(false);
        }
    } catch (err) {
        console.error('ERROR in startCodingAssessment:', err, err.stack);
        showToast('Failed to load questions: ' + err.message, 'error');
        showLoading(false);
    }
}

// ==================== QUESTION LOADING ====================
function loadQuestion() {
    console.log('=== loadQuestion START ===');
    try {
        console.log('selectedQuestions length:', selectedQuestions?.length);
        console.log('currentQuestionIndex:', currentQuestionIndex);
        
        if (!selectedQuestions || selectedQuestions.length === 0 || currentQuestionIndex >= selectedQuestions.length) {
            console.error('No questions available or invalid index', { selectedQuestions, currentQuestionIndex });
            showToast('Failed to load questions: Invalid state', 'error');
            return;
        }

        const question = selectedQuestions[currentQuestionIndex];
        if (!question) {
            console.error('Question not found at index:', currentQuestionIndex);
            showToast('Failed to load questions: Question object is null', 'error');
            return;
        }
        
        if (!question.title || !question.description || !question.example) {
            console.error('Question missing required fields:', question);
            showToast('Failed to load questions: Question data incomplete', 'error');
            return;
        }
        
        // Use locked language if set, otherwise default to java
        currentLanguage = lockedLanguage || 'java';

        // Render question template into programmingContainer
        const container = document.getElementById('programmingContainer');
        if (!container) {
            console.error('programmingContainer element not found');
            return;
        }

        // Build language tab buttons — disable non-locked tabs for Q2+
        const langs = [
            { key: 'java',       icon: '☕', label: 'Java' },
            { key: 'python',     icon: '🐍', label: 'Python' },
            { key: 'javascript', icon: '📜', label: 'JavaScript' }
        ];
        const langTabsHtml = langs.map(l => {
            const isActive = l.key === currentLanguage;
            const isDisabled = lockedLanguage && l.key !== lockedLanguage;
            const cls = 'language-tab' + (isActive ? ' active' : '') + (isDisabled ? ' disabled' : '');
            const disAttr = isDisabled ? ' disabled' : '';
            const style = isDisabled ? ' style="opacity:0.4;cursor:not-allowed;pointer-events:none;"' : '';
            return `<button class="${cls}" onclick="switchLanguage('${l.key}', this)"${disAttr}${style}>${l.icon} ${l.label}</button>`;
        }).join('\n                    ');

        container.innerHTML = `
            <div class="question-section">
                <h3>Question ${currentQuestionIndex + 1}: ${escapeHtml(question.title)}</h3>
                <p><strong>Description:</strong></p>
                <p>${escapeHtml(question.description)}</p>
                <p><strong>Example:</strong></p>
                <pre>${escapeHtml(question.example)}</pre>
            </div>

            <div class="editor-section">
                <div class="language-tabs">
                    ${langTabsHtml}
                </div>

                <div class="editor-column">
                    <div class="section-heading">💻 Code Editor</div>
                    <div class="code-editor" id="codeEditor"></div>
                    <div class="editor-buttons">
                        <button class="btn btn-primary" onclick="runCode()">▶ Run Code</button>
                    </div>
                    <div class="output-section" id="outputSection">
                        <div class="output-title">Output:</div>
                        <span id="output">Ready to run...</span>
                    </div>
                </div>
            </div>
        `;

        // Setup navigation buttons after the container
        setupQuestionNavigation();

        // Update progress display
        updateProgressBar();

        // Initialize CodeMirror editor
        initializeEditor();

        // Restore output state if any
        restoreOutputState();

        // Spec Section 13: Lock/unlock based on timer state
        if (questionTimeLeft[question.id] <= 0) {
            lockCodeEditor();
        } else {
            unlockCodeEditor();
        }

        codeExecutedForCurrentQuestion = false;
        
        console.log('=== loadQuestion completed successfully ===');
    } catch (err) {
        console.error('Error in loadQuestion:', err);
        showToast('Failed to load questions: ' + err.message, 'error');
    }
}

// ==================== DYNAMIC NAVIGATION BUTTONS ====================
function setupQuestionNavigation() {
    // Remove any existing navigation div
    const existingNav = document.querySelector('.question-nav-buttons');
    if (existingNav) existingNav.remove();
    const existingConsent = document.querySelector('.question-consent-box');
    if (existingConsent) existingConsent.remove();
    const existingResults = document.getElementById('agentAnalysisResults');
    if (existingResults) existingResults.remove();

    const container = document.getElementById('programmingContainer');
    if (!container) return;

    const isFirst = currentQuestionIndex === 0;
    const isLast = currentQuestionIndex === selectedQuestions.length - 1;
    const totalQ = selectedQuestions.length;

    let navHtml = '';

    // For Q1 (first question, not last): show consent box before nav buttons
    if (isFirst && !isLast) {
        const nextQNum = currentQuestionIndex + 2;
        const currentQNum = currentQuestionIndex + 1;
        navHtml += `<div class="question-consent-box consent-box" id="questionConsentBox" style="margin-top: 20px;">
            <label>
                <input type="checkbox" id="questionConsentCheckbox" onchange="handleQuestionConsentChange()" disabled style="cursor:not-allowed;">
                <span>🛡️ I agree to move to question ${nextQNum}. The timer for question ${currentQNum} will be set to '0' and <strong style="color:#d32f2f;">I cannot come back to question ${currentQNum}</strong>. Only the question ${nextQNum} timer will remain.</span>
            </label>
            <div id="consentRunCodeHint" style="color:#d32f2f;font-size:12px;margin-top:4px;margin-left:24px;">⚠️ You must click "Run Code" at least once before you can proceed.</div>
        </div>`;
    }

    navHtml += '<div class="question-nav-buttons" style="margin-top: 20px; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">';

    // Previous button — REMOVED for Q2 (second question, index 1)
    // Only show for questions after Q2
    if (!isFirst && currentQuestionIndex > 1) {
        // Check if previous question timer expired
        const prevQuestion = selectedQuestions[currentQuestionIndex - 1];
        const prevTimeLeft = questionTimeLeft[prevQuestion.id] || 0;
        if (prevTimeLeft <= 0) {
            navHtml += `<button class="btn btn-secondary nav-btn-prev" onclick="previousQuestion()" disabled title="Previous question timer is done, can't move to previous one" style="opacity:0.5;cursor:not-allowed;">← Previous</button>`;
        } else {
            navHtml += `<button class="btn btn-secondary nav-btn-prev" onclick="previousQuestion()">← Previous</button>`;
        }
    }

    if (!isLast) {
        if (isFirst) {
            // Q1: 'Move to Next' button — disabled until consent checkbox is checked
            navHtml += `<button class="btn btn-success nav-btn-next" id="moveToNextBtn" onclick="nextQuestion()" disabled title="Please check the consent box above to proceed" style="opacity:0.5;cursor:not-allowed;">Move to Next →</button>`;
        } else {
            // Other non-last questions: regular Next button
            if (CONFIG.nextButtonEnabled) {
                navHtml += `<button class="btn btn-success nav-btn-next" onclick="nextQuestion()">Next →</button>`;
            } else {
                navHtml += `<button class="btn btn-success nav-btn-next" onclick="nextQuestion()" disabled title="Available after timer expires">Next →</button>`;
            }
        }
    } else {
        // Last question: Mark Complete + Agent Score
        const markCompleteDisabled = !bulkAnalysisResult
            ? 'disabled title="Run Agent Score first" style="opacity:0.5;pointer-events:none;cursor:not-allowed;"'
            : '';
        navHtml += `<button class="btn btn-success nav-btn-complete" onclick="completeProgram()" ${markCompleteDisabled}>✓ Mark Complete</button>`;
        navHtml += `<button class="btn btn-agent-analysis" id="btnAgentAnalysis" onclick="runBulkAnalysis()">📊 Agent Score</button>`;
    }

    navHtml += '</div>';

    // Add agent analysis results div for last question
    if (isLast) {
        navHtml += '<div id="agentAnalysisResults" style="display:none;"></div>';
    }

    container.insertAdjacentHTML('afterend', navHtml);

    // Restore bulk analysis results if they exist
    if (isLast && bulkAnalysisRenderedHtml) {
        const resultsDiv = document.getElementById('agentAnalysisResults');
        if (resultsDiv) {
            resultsDiv.innerHTML = bulkAnalysisRenderedHtml;
            resultsDiv.style.display = 'block';
        }
    }
}

// ==================== LANGUAGE SWITCHING ====================
function switchLanguage(language, btn) {
    // If language is already locked to something else, block the switch
    if (lockedLanguage && language !== lockedLanguage) {
        showToast(`Language is locked to ${lockedLanguage.charAt(0).toUpperCase() + lockedLanguage.slice(1)}. You must use the same language for all questions.`, 'error');
        return;
    }

    // Save current code and output state
    saveCurrentCode();
    saveCurrentOutputState();

    currentLanguage = language;

    // Update active tab styling
    document.querySelectorAll('.language-tab').forEach(t => t.classList.remove('active'));
    if (btn) btn.classList.add('active');

    // Re-initialize editor with new language
    initializeEditor();

    // Restore output for the new language
    restoreOutputState();

    // Spec Section 13: Re-lock editor if question timer expired
    const question = selectedQuestions[currentQuestionIndex];
    if (questionTimeLeft[question.id] <= 0) {
        lockCodeEditor();
    }
}

function saveCurrentCode() {
    if (!window.editor || !selectedQuestions || selectedQuestions.length === 0) return;
    const question = selectedQuestions[currentQuestionIndex];
    if (!question) return;
    const codeKey = `q${question.id}-${currentLanguage}`;
    codeState[codeKey] = window.editor.getValue();
}

function saveCurrentOutputState() {
    if (!selectedQuestions || selectedQuestions.length === 0) return;
    const question = selectedQuestions[currentQuestionIndex];
    if (!question) return;
    const outputEl = document.getElementById('output');
    const sectionEl = document.getElementById('outputSection');
    if (!outputEl || !sectionEl) return;
    
    const outputKey = `q${question.id}`;
    if (!outputState[outputKey]) outputState[outputKey] = {};
    outputState[outputKey][currentLanguage] = {
        html: outputEl.innerHTML,
        sectionClass: sectionEl.className,
        validationStatus: sectionEl.dataset.validationStatus || '',
        lastRunResult: lastRunResult
    };
}

function restoreOutputState() {
    const question = selectedQuestions[currentQuestionIndex];
    if (!question) return;
    const outputKey = `q${question.id}`;
    const saved = outputState[outputKey]?.[currentLanguage];
    const outputEl = document.getElementById('output');
    const sectionEl = document.getElementById('outputSection');
    
    if (saved && saved.html && outputEl && sectionEl) {
        outputEl.innerHTML = saved.html;
        sectionEl.className = saved.sectionClass || 'output-section';
        sectionEl.dataset.validationStatus = saved.validationStatus || '';
        lastRunResult = saved.lastRunResult || null;
    } else if (outputEl) {
        outputEl.textContent = 'Ready to run...';
        lastRunResult = null;
    }
}

function initializeEditor() {
    try {
        if (!selectedQuestions || selectedQuestions.length === 0 || currentQuestionIndex >= selectedQuestions.length) {
            console.error('Cannot initialize editor: no valid questions');
            return;
        }
        
        const question = selectedQuestions[currentQuestionIndex];
        if (!question) {
            console.error('Question not found');
            return;
        }
        
        const codeKey = `q${question.id}-${currentLanguage}`;
        const code = codeState[codeKey] || getTemplateForLanguage(currentLanguage, question);

        // Destroy existing editor if it exists
        if (window.editor && typeof window.editor === 'object') {
            try {
                if (typeof window.editor.getWrapperElement === 'function') {
                    const wrapper = window.editor.getWrapperElement();
                    if (wrapper && wrapper.parentNode) {
                        wrapper.parentNode.removeChild(wrapper);
                    }
                }
            } catch (e) {
                console.warn('Could not cleanly destroy editor:', e);
            }
            window.editor = null;
        }

        const editorDiv = document.getElementById('codeEditor');
        if (!editorDiv) {
            console.error('codeEditor element not found');
            return;
        }
        
        editorDiv.innerHTML = '';

        if (typeof CodeMirror === 'undefined') {
            console.error('CodeMirror not loaded');
            showToast('CodeMirror library not loaded', 'error');
            return;
        }

        window.editor = CodeMirror(editorDiv, {
            value: code,
            mode: currentLanguage === 'java' ? 'text/x-java' : currentLanguage === 'python' ? 'python' : 'javascript',
            theme: 'material',
            lineNumbers: true,
            indentUnit: 4,
            tabSize: 4,
            indentWithTabs: false,
            lineWrapping: true,
            styleActiveLine: true,
            matchBrackets: true,
            autoCloseBrackets: true,
            extraKeys: {
                'Ctrl-/': function(cm) { cm.toggleComment(); }
            }
        });

        // Spec Section 7: Track snapshot for change detection
        window._editorInitialCode = code;

        // Track typing metrics
        window.editor.on('change', (cm, changeObj) => {
            try {
                
                if (!selectedQuestions || selectedQuestions.length === 0 || currentQuestionIndex >= selectedQuestions.length) return;
                
                const q = selectedQuestions[currentQuestionIndex];
                if (!q) return;
                
                const currentCode = cm.getValue();
                const codeKey = `q${q.id}-${currentLanguage}`;
                codeState[codeKey] = currentCode;

                const metrics = typingMetrics[q.id];
                if (!metrics) return;

                const now = Date.now();

                // === Only count user-initiated keystrokes (+input for typing, +delete for backspace) ===
                if (changeObj.origin === '+input' || changeObj.origin === '+delete') {
                    metrics.keystrokes++;

                    // Deletion tracking (Signal #11)
                    if (changeObj.origin === '+delete') {
                        metrics.deletionCount++;
                    }

                    // Cursor line tracking for linearity detection (Signal #12)
                    if (changeObj.from && changeObj.from.line !== undefined) {
                        metrics.cursorLineChanges.push(changeObj.from.line);
                        if (metrics.cursorLineChanges.length > 200) metrics.cursorLineChanges.shift();
                    }

                    // Pause detection: >3 second gap between keystrokes (Signals #6, #9, #10)
                    if (metrics.lastKeystrokeTime > 0) {
                        const gap = now - metrics.lastKeystrokeTime;
                        if (gap > 3000) {
                            metrics.pauseCount++;
                            metrics.totalPauseDuration += gap;
                            metrics.pauseDurations.push(gap);
                            // Close current typing session, start new one
                            if (metrics.currentSessionChars > 0) {
                                metrics.typingSessionChunks.push(metrics.currentSessionChars);
                            }
                            metrics.currentSessionChars = 0;
                        }
                    }
                    metrics.lastKeystrokeTime = now;
                    metrics.currentSessionChars++;

                    // Rolling window of keystroke timestamps (last 100)
                    metrics.keystrokeTimestamps.push(now);
                    if (metrics.keystrokeTimestamps.length > 100) metrics.keystrokeTimestamps.shift();
                }

                // === Burst detection: paste or large text insertion (>20 chars) (Signal #2) ===
                if (changeObj.origin === 'paste' ||
                    (changeObj.text && changeObj.text.join('\n').length > 20 && changeObj.origin !== '+delete')) {
                    const charsAdded = changeObj.text ? changeObj.text.join('\n').length : 0;
                    if (charsAdded > 0) {
                        metrics.bursts.push({ charsAdded: charsAdded, timestamp: now });
                    }
                }

                // === Total chars typed (all changes) ===
                metrics.totalCharsTyped += (changeObj.text ? changeObj.text.join('').length : 0);

                // Spec Section 25: Invalidate agent analysis on code edit
                if (currentCode !== window._editorInitialCode) {
                    onCodeEditedAfterAnalysis();
                }
            } catch (err) {
                console.error('Error in editor change handler:', err);
            }
        });

        window.editor.on('mousemove', () => {
            try {
                const metrics = typingMetrics[selectedQuestions[currentQuestionIndex]?.id];
                if (!metrics) return;
                metrics.mouseMovements++;
                metrics.mouseMovementTimestamps.push(Date.now());
                // Rolling window: keep only the last 50 timestamps
                if (metrics.mouseMovementTimestamps.length > 50) {
                    metrics.mouseMovementTimestamps.shift();
                }
            } catch (e) {
                // Silently ignore mouse tracking errors
            }
        });

        // Copy/paste handling — internal clipboard (spec Section 11)
        // Block external clipboard, allow internal copy/cut/paste within editor
        window.editor.on('copy', function(cm, e) {
            if (CONFIG.copyPasteEnabled) return; // allow if enabled
            const selection = cm.getSelection();
            if (selection) internalClipboard = selection;
            e.preventDefault();
        });

        window.editor.on('cut', function(cm, e) {
            if (CONFIG.copyPasteEnabled) return;
            const selection = cm.getSelection();
            if (selection) {
                internalClipboard = selection;
                cm.replaceSelection('');
            }
            e.preventDefault();
        });

        window.editor.on('paste', function(cm, e) {
            if (CONFIG.copyPasteEnabled) return;
            e.preventDefault();
            if (internalClipboard) {
                cm.replaceSelection(internalClipboard);
            }
        });

        // Block right-click context menu and Ctrl+C/V on the page-level
        const codeMirrorEl = editorDiv.querySelector('.CodeMirror');
        if (codeMirrorEl) {
            codeMirrorEl.addEventListener('contextmenu', (e) => {
                if (!CONFIG.copyPasteEnabled) e.preventDefault();
            });
        }
    } catch (err) {
        console.error('Error in initializeEditor:', err);
        showToast('Failed to initialize code editor: ' + err.message, 'error');
    }
}

function updateOutputDisplay(data, language) {
    // Called after runCode to display results in the new output section
    const question = selectedQuestions[currentQuestionIndex];
    if (!question) return;

    const outputEl = document.getElementById('output');
    const sectionEl = document.getElementById('outputSection');
    if (!outputEl || !sectionEl) return;

    const expectedOutput = extractExpectedOutput(question);

    if (data && data.success) {
        const actualOutput = data.output || '';

        // Safety net: re-check for hardcoded output even after execution
        const currentCode = window.editor ? window.editor.getValue() : '';
        if (currentCode && detectHardcodedOutputClient(currentCode, language || currentLanguage)) {
            sectionEl.dataset.validationStatus = 'hardcoded-error';
            sectionEl.className = 'output-section error';
            let html = `<div style="font-weight:bold;color:#c62828;margin-bottom:8px;">⚠️ Hardcoded Output Detected</div>`;
            html += `<div style="background:#fff3e0;border:1px solid #ff9800;border-radius:6px;padding:12px;margin-bottom:10px;">`;
            html += `<div style="color:#e65100;font-weight:bold;margin-bottom:6px;">🚫 Error: Your code only contains print/output statements with hardcoded values.</div>`;
            html += `<div style="color:#bf360c;">The output matched, but no algorithm or logic was found. This is not a valid solution.</div>`;
            html += `<div style="color:#bf360c;margin-top:6px;"><strong>Please write actual logic</strong> (loops, conditions, variables, calculations, etc.) to solve the problem.</div>`;
            html += `</div>`;
            html += `<div style="margin-top:10px;"><div style="font-weight:bold;color:#555;margin-bottom:4px;">📌 Expected Output:</div><pre style="margin:0;background:#f5f5f5;padding:8px;border-radius:4px;border-left:3px solid #2196F3;white-space:pre-wrap;font-family:monospace;word-wrap:break-word;font-size:13px;">${escapeHtml(expectedOutput)}</pre></div>`;
            outputEl.innerHTML = html;
            results[currentQuestionIndex].status = 'failed';
            results[currentQuestionIndex].errorMessage = 'Hardcoded output detected — no algorithm implementation';
            results[currentQuestionIndex].executionPhase = 'hardcoded-detection';
            lastRunResult = null;
            saveCurrentOutputState();
            return;
        }

        // Validate output (order-independent for map/dict outputs)
        const isCorrect = outputsMatch(actualOutput, expectedOutput);
        
        sectionEl.dataset.validationStatus = isCorrect ? 'matched' : 'mismatched';
        sectionEl.className = isCorrect ? 'output-section success' : 'output-section error';
        
        if (isCorrect) {
            outputEl.innerHTML = `<div style="font-weight:bold;color:#2e7d32;margin-bottom:8px;">✓ Correct Output</div>`;
        } else {
            outputEl.innerHTML = `<div style="font-weight:bold;color:#c62828;margin-bottom:8px;">✗ Output Mismatch</div>`;
        }
        
        // Always show both Expected and Actual output for comparison
        let html = outputEl.innerHTML;
        html += `<div style="margin-bottom:10px;"><div style="font-weight:bold;color:#555;margin-bottom:4px;">📌 Expected Output:</div><pre style="margin:0;background:#f5f5f5;padding:8px;border-radius:4px;border-left:3px solid #2196F3;white-space:pre-wrap;font-family:monospace;word-wrap:break-word;font-size:13px;">${escapeHtml(expectedOutput)}</pre></div>`;
        html += `<div><div style="font-weight:bold;color:#555;margin-bottom:4px;">📤 Actual Output:</div><pre style="margin:0;background:#f5f5f5;padding:8px;border-radius:4px;border-left:3px solid ${isCorrect ? '#4CAF50' : '#f44336'};white-space:pre-wrap;font-family:monospace;word-wrap:break-word;font-size:13px;">${escapeHtml(actualOutput)}</pre></div>`;
        
        outputEl.innerHTML = html;

        lastRunResult = { isCorrect, expectedOutput, actualOutput };

        // Update results
        results[currentQuestionIndex].status = isCorrect ? 'completed' : 'failed';
        results[currentQuestionIndex].actualOutput = actualOutput;
        results[currentQuestionIndex].errorMessage = '';
        results[currentQuestionIndex].executionPhase = 'success';
    } else if (data && !data.success) {
        const phase = data.phase || 'execution';
        const errorMsg = data.error || 'Unknown error';
        const partialOutput = data.output || '';
        
        sectionEl.dataset.validationStatus = 'execution-error';
        sectionEl.className = 'output-section error';
        
        const phaseLabel = phase === 'compilation' ? 'Compilation Error' : 'Runtime Error';
        let html = `<div style="font-weight:bold;color:#c62828;margin-bottom:6px;">✗ Error (${escapeHtml(language || currentLanguage)}): ${phaseLabel}</div>`;
        html += `<div style="white-space:pre-wrap;font-family:monospace;color:#c62828;">${escapeHtml(errorMsg)}</div>`;
        if (partialOutput) {
            html += `<div style="margin-top:8px;padding-top:6px;border-top:1px solid #ddd;"><strong>Partial Output:</strong><pre style="margin:4px 0;">${escapeHtml(partialOutput)}</pre></div>`;
        }
        outputEl.innerHTML = html;

        results[currentQuestionIndex].errorMessage = errorMsg;
        results[currentQuestionIndex].executionPhase = phase;
        lastRunResult = null;
    }

    // Save output state
    saveCurrentOutputState();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Spec Section 20: normalizeOutput — line-by-line trim, smart quote fix, whitespace collapse
function normalizeOutput(text) {
    if (text == null) return '';
    if (typeof text !== 'string') text = String(text);
    return text
        .replace(/\r\n/g, '\n')              // Normalize line endings
        .split('\n')
        .map(line => line.trim().replace(/[^\S\n]+/g, ' '))  // Trim each line + collapse horizontal whitespace
        .filter(Boolean)                       // Remove empty lines
        .join('\n')
        .replace(/[\u2018\u2019]/g, "'")      // Smart quotes → straight quotes
        .replace(/[\u201C\u201D]/g, '"')
        .trim();
}

// Spec Section 20: extractExpectedOutput — pull expected output from question example
function extractExpectedOutput(question) {
    const example = String(question.example || '').trim();
    if (!example) return '';

    // Try to find "Output: ..." in the example text
    const outputMatch = example.match(/Output:\s*([\s\S]*)$/i);
    let expected = outputMatch ? outputMatch[1].trim() : '';

    // Fallback: use the last line of the example
    if (!expected) {
        const exampleLines = example.split('\n').map(line => line.trim()).filter(Boolean);
        expected = exampleLines[exampleLines.length - 1] || example;
    }

    // Clean up: remove surrounding quotes
    expected = expected.replace(/^['"]|['"]$/g, '').trim();

    // Only remove trailing parenthetical notes that look like editorial comments
    // (e.g., "(example)", "(varies)"), NOT data like "(index 5)" that is part of the output format
    expected = expected.replace(/\s*\((example|note|varies|optional|see above|approximately|approx|may vary|random)[^)]*\)\s*$/gi, '').trim();

    return expected;
}

// Some questions are intentionally non-deterministic (e.g., random output, ellipsis examples).
// For those, strict expected-vs-actual gating should be skipped for AI scoring.
function isDeterministicExpectedOutput(expectedOutput) {
    const text = String(expectedOutput || '').toLowerCase().trim();
    if (!text) return false;
    if (text.includes('...')) return false;
    if (text.includes('random')) return false;
    if (text.includes('example:')) return false;
    return true;
}

// Spec Section 20: extractTrailingNumber — helper for numeric comparison
function extractTrailingNumber(text) {
    const match = String(text || '').match(/-?\d+(?:\.\d+)?(?!(?:.*-?\d))/);
    return match ? Number(match[0]) : null;
}

// Spec Section 20: validateOutput — full validation with exact, substring, numeric, and order-independent match
function validateOutput(question, output) {
    const actual = normalizeOutput(output);
    const expected = normalizeOutput(extractExpectedOutput(question));

    if (!actual || !expected) {
        return {
            isCorrect: false,
            expectedOutput: expected,
            actualOutput: actual,
            reason: 'Unable to validate output for this question.'
        };
    }

    // Flatten for content-only comparison (ignores newline differences)
    const flatActual = actual.replace(/\s+/g, ' ').trim();
    const flatExpected = expected.replace(/\s+/g, ' ').trim();

    // Exact match or substring match
    if (actual === expected || flatActual === flatExpected || flatActual.includes(flatExpected) || flatExpected.includes(flatActual)) {
        return {
            isCorrect: true,
            expectedOutput: expected,
            actualOutput: actual,
            reason: 'Output matches the expected result.'
        };
    }

    // Numeric comparison with tolerance (handles floating point)
    const expectedNumber = extractTrailingNumber(flatExpected);
    const actualNumber = extractTrailingNumber(flatActual);
    if (expectedNumber !== null && actualNumber !== null && Math.abs(expectedNumber - actualNumber) < 0.01) {
        return {
            isCorrect: true,
            expectedOutput: expected,
            actualOutput: actual,
            reason: 'Numeric output matches the expected result.'
        };
    }

    // Order-independent match (for HashMap/dict outputs)
    if (outputsMatchOrderIndependent(actual, expected)) {
        return {
            isCorrect: true,
            expectedOutput: expected,
            actualOutput: actual,
            reason: 'Output matches (order-independent).'
        };
    }

    return {
        isCorrect: false,
        expectedOutput: expected,
        actualOutput: actual,
        reason: 'Output does not match the expected result.'
    };
}

// Order-independent output comparison:
// Splits output into tokens (by commas, newlines, or spaces), sorts them,
// and compares. This handles HashMap/dictionary outputs where order varies.
function outputsMatchOrderIndependent(actual, expected) {
    const tokenize = (s) => {
        if (s == null) return [];
        const str = typeof s === 'string' ? s : String(s);
        let tokens = str.includes(',') ? str.split(',') : str.split(/\n/);
        return tokens
            .map(t => t.trim().toLowerCase().replace(/\s+/g, ' '))
            .filter(t => t.length > 0)
            .sort();
    };

    const actualTokens = tokenize(actual);
    const expectedTokens = tokenize(expected);

    if (actualTokens.length === expectedTokens.length && actualTokens.length > 0) {
        if (actualTokens.join('|') === expectedTokens.join('|')) return true;
    }
    return false;
}

// Backwards-compatible wrapper used by updateOutputDisplay, askAgent, runBulkAnalysis
function outputsMatch(actual, expected) {
    const normA = normalizeOutput(actual);
    const normE = normalizeOutput(expected);

    // Avoid false positives when question data has no expected output.
    if (!normA || !normE) return false;

    // 1. Try exact normalized match first (preserves newlines)
    if (normA === normE) return true;

    // 2. Flatten comparison — collapse all whitespace for content-only match
    const flatA = normA.replace(/\s+/g, ' ').trim();
    const flatE = normE.replace(/\s+/g, ' ').trim();
    if (flatA === flatE) return true;

    // 3. Substring match (ONLY for multi-line outputs like lists, arrays, or structured data)
    // Don't use substring match for single-word or short outputs (high false positive rate)
    if (flatE.length > 10 && (flatA.includes(flatE) || flatE.includes(flatA))) return true;

    // 4. Numeric match
    const expectedNum = extractTrailingNumber(flatE);
    const actualNum = extractTrailingNumber(flatA);
    if (expectedNum !== null && actualNum !== null && Math.abs(expectedNum - actualNum) < 0.01) return true;

    // 5. Order-independent match
    if (outputsMatchOrderIndependent(actual, expected)) return true;

    return false;
}

function updateProgressBar() {
    try {
        const progress = ((currentQuestionIndex + 1) / totalPrograms) * 100;
        const fillEl = document.getElementById('progressFill');
        const currentEl = document.getElementById('currentQuestion');
        const totalEl = document.getElementById('totalQuestions');
        
        if (fillEl) fillEl.style.width = progress + '%';
        if (currentEl) currentEl.textContent = currentQuestionIndex + 1;
        if (totalEl) totalEl.textContent = totalPrograms;
    } catch (err) {
        console.error('Error in updateProgressBar:', err);
    }
}

// ==================== CODE EXECUTION ====================

// Detect if code uses stdin (Scanner/System.in for Java, input() for Python)
function codeNeedsStdin(code, language) {
    if (language === 'java') {
        return /Scanner\s*\(\s*System\.in\s*\)|BufferedReader\s*\(\s*new\s+InputStreamReader\s*\(\s*System\.in|System\.in\.read/i.test(code);
    } else if (language === 'python') {
        return /\binput\s*\(/.test(code);
    } else if (language === 'javascript') {
        return /require\s*\(\s*['"]readline['"]\)|process\.stdin|readline\.createInterface/.test(code);
    }
    return false;
}

// Extract test input values from question example text
function extractTestInput(question) {
    if (!question || !question.example) return '';
    const example = question.example;
    // Try to extract Input: value(s)
    const inputMatch = example.match(/Input:\s*(.+?)(?:\nOutput:|$)/si);
    if (!inputMatch) return '';
    let inputStr = inputMatch[1].trim();
    // Handle patterns like "s = \"my is x\", a = \"name\""
    // Handle patterns like "2024" or "{A=10, B=19}"
    // Handle patterns like "[1, 2, 0, 4, 3, 0, 5, 0]"
    // For simple numeric/string values, extract them
    const values = [];
    // Check for variable assignments: varName = value
    const assignmentPattern = /\w+\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
    let m;
    while ((m = assignmentPattern.exec(inputStr)) !== null) {
        const val = m[1] || m[2] || m[3];
        if (val !== undefined) values.push(val);
    }
    if (values.length > 0) return values.join('\n') + '\n';
    // If no variable assignments found, try the raw input (e.g. just "2024")
    // Strip surrounding brackets/braces for array/map inputs
    inputStr = inputStr.replace(/^[\[{(]|[\]})]$/g, '').trim();
    // If it looks like comma-separated values, split them
    if (inputStr.includes(',')) {
        return inputStr.split(',').map(v => v.trim()).join('\n') + '\n';
    }
    return inputStr + '\n';
}

// --- Client-side hardcoded output detection (mirrors server logic) ---
function detectHardcodedOutputClient(code, language) {
    let userLogic = code;
    if (language === 'java') {
        userLogic = userLogic
            .replace(/import\s+[\w.*]+;/g, '')
            .replace(/public\s+class\s+\w+\s*\{/g, '')
            .replace(/public\s+static\s+void\s+main\s*\([^)]*\)\s*\{/g, '')
            .replace(/\/\/.*$/gm, '')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^\s*\}\s*$/gm, '')
            .trim();
        const prints = (userLogic.match(/System\.out\.print(ln)?\s*\(/g) || []).length;
        if (prints === 0) return false;
        const hasLoops = /for\s*\(|while\s*\(|\.forEach|\.stream/.test(userLogic);
        const hasConditions = /if\s*\(|else\s|switch\s*\(|\?.*:/.test(userLogic);
        const hasDataStructures = /new\s+(ArrayList|HashMap|HashSet|LinkedHashMap|TreeMap|TreeSet|LinkedList|PriorityQueue|StringBuilder)/.test(userLogic);
        const hasMethodCalls = /\.(split|substring|charAt|toCharArray|contains|indexOf|replaceAll|replace|length|sort|add|put|get|remove|size|isEmpty|trim|toLowerCase|toUpperCase)\s*\(/.test(userLogic);
        const hasMath = /Math\.|%\s*\d|\+\+|--(?!\s)|\+=|-=|\*=|\^=/.test(userLogic);
        const hasArrays = /\w+\s*\[\s*\w+\s*\]|new\s+\w+\s*\[/.test(userLogic);
        const hasInput = /Scanner|BufferedReader|System\.in/.test(userLogic);
        const hasUserMethods = /(?:public|private|static)\s+(?!void\s+main)\w+\s+\w+\s*\(/.test(code);
        const hasRecursion = /\w+\s*\(\s*\w+\s*[+\-]\s*1\s*\)/.test(userLogic);
        let varDeclCount = 0;
        const declMatches = userLogic.match(/(int|String|long|double|boolean|char|float|var)\s+\w+\s*=[^;]*/g) || [];
        declMatches.forEach(decl => { varDeclCount += decl.split(',').length; });
        const hasVariableLogic = varDeclCount >= 2;
        const hasArithmeticAssignment = /\w+\s*=\s*\w+\s*[+\-\*\/\^%]\s*\w+/.test(userLogic);
        const onlyPrints = userLogic.replace(/System\.out\.print(ln)?\s*\([\s\S]*?\);?/g, '').trim().length === 0;
        if ((!hasLoops && !hasConditions && !hasDataStructures && !hasMethodCalls && !hasMath && !hasArrays && !hasInput && !hasUserMethods && !hasRecursion && !hasVariableLogic && !hasArithmeticAssignment) || onlyPrints) return true;
    } else if (language === 'python') {
        userLogic = userLogic
            .replace(/#.*$/gm, '')
            .replace(/'''[\s\S]*?'''/g, '').replace(/"""[\s\S]*?"""/g, '')
            .trim();
        const prints = (userLogic.match(/print\s*\(/g) || []).length;
        if (prints === 0) return false;
        const hasLoops = /for\s+\w+\s+in\s|while\s+/.test(userLogic);
        const hasConditions = /\bif\s+|\belse\s*:|elif\s+/.test(userLogic);
        const hasFunctions = (userLogic.match(/def\s+\w+\s*\(/g) || []).length > 0;
        const hasMethodCalls = /\.(split|replace|find|count|index|join|sort|sorted|append|add|strip|lower|upper|isdigit|isalpha|items|keys|values|pop|remove|insert|reverse|startswith|endswith)\s*\(/.test(userLogic);
        const hasComprehensions = /\[.*\bfor\b.*\bin\b.*\]|\{.*\bfor\b.*\bin\b.*\}/.test(userLogic);
        const hasBuiltins = /\b(len|range|enumerate|zip|map|filter|sum|min|max|abs|int|str|list|dict|set|sorted|reversed|ord|chr)\s*\(/.test(userLogic);
        const hasVariableLogic = (userLogic.match(/\w+\s*=\s*(?!.*print)/g) || []).length >= 2;
        const hasRecursion = /\w+\s*\(\s*\w+\s*[+\-]\s*1\s*\)/.test(userLogic);
        const hasArithmeticAssignment = /\w+\s*=\s*\w+\s*[+\-\*\/\^%]\s*\w+/.test(userLogic);
        const hasTupleSwap = /\w+\s*,\s*\w+\s*=\s*\w+\s*,\s*\w+/.test(userLogic);
        const onlyPrints = userLogic.replace(/print\s*\([\s\S]*?\)/g, '').trim().length === 0;
        if ((!hasLoops && !hasConditions && !hasFunctions && !hasMethodCalls && !hasComprehensions && !hasBuiltins && !hasVariableLogic && !hasRecursion && !hasArithmeticAssignment && !hasTupleSwap) || onlyPrints) return true;
    } else if (language === 'javascript') {
        userLogic = userLogic
            .replace(/\/\/.*$/gm, '')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .trim();
        const prints = (userLogic.match(/console\.log\s*\(/g) || []).length;
        if (prints === 0) return false;
        const hasLoops = /for\s*\(|while\s*\(|\.forEach|\.map|\.filter|\.reduce/.test(userLogic);
        const hasConditions = /if\s*\(|else\s|switch\s*\(|\?.*:/.test(userLogic);
        const hasFunctions = /function\s+\w+|=>|\bclass\s/.test(userLogic);
        const hasMethodCalls = /\.(split|substring|charAt|includes|indexOf|replace|replaceAll|length|sort|push|pop|shift|unshift|splice|slice|join|trim|toLowerCase|toUpperCase|map|filter|reduce|find|some|every|keys|values|entries|reverse|repeat|startsWith|endsWith)\s*\(/.test(userLogic);
        const hasBuiltins = /\b(Math\.|parseInt|parseFloat|String\.|Number\.|Array\.|Object\.|JSON\.|Set|Map|new\s+Set|new\s+Map|isNaN|typeof)/.test(userLogic);
        const hasVariableLogic = (userLogic.match(/(const|let|var)\s+\w+\s*=/g) || []).length >= 2;
        const hasRecursion = /\w+\s*\(\s*\w+\s*[+\-]\s*1\s*\)/.test(userLogic);
        const hasArithmeticAssignment = /\w+\s*=\s*\w+\s*[+\-\*\/\^%]\s*\w+/.test(userLogic);
        const onlyPrints = userLogic.replace(/console\.log\s*\([\s\S]*?\);?/g, '').trim().length === 0;
        if ((!hasLoops && !hasConditions && !hasFunctions && !hasMethodCalls && !hasBuiltins && !hasVariableLogic && !hasRecursion && !hasArithmeticAssignment) || onlyPrints) return true;
    }
    return false;
}

async function runCode() {
    if (!window.editor) {
        showToast('Editor not initialized', 'warning');
        return;
    }
    const code = window.editor.getValue();
    if (!code.trim()) {
        showToast('Please write some code first', 'warning');
        return;
    }

    // --- Hardcoded output detection: block execution if only print statements ---
    if (detectHardcodedOutputClient(code, currentLanguage)) {
        const question = selectedQuestions[currentQuestionIndex];
        const outputEl = document.getElementById('output');
        const sectionEl = document.getElementById('outputSection');
        if (outputEl && sectionEl) {
            sectionEl.dataset.validationStatus = 'hardcoded-error';
            sectionEl.className = 'output-section error';
            const expectedOutput = extractExpectedOutput(question);
            let html = `<div style="font-weight:bold;color:#c62828;margin-bottom:8px;">⚠️ Hardcoded Output Detected</div>`;
            html += `<div style="background:#fff3e0;border:1px solid #ff9800;border-radius:6px;padding:12px;margin-bottom:10px;">`;
            html += `<div style="color:#e65100;font-weight:bold;margin-bottom:6px;">🚫 Error: Your code only contains print/output statements with hardcoded values.</div>`;
            html += `<div style="color:#bf360c;">No algorithm or logic implementation was found. Simply printing the expected answer is not a valid solution.</div>`;
            html += `<div style="color:#bf360c;margin-top:6px;"><strong>Please write actual logic</strong> (loops, conditions, variables, calculations, etc.) to solve the problem.</div>`;
            html += `</div>`;
            html += `<div style="margin-top:10px;"><div style="font-weight:bold;color:#555;margin-bottom:4px;">📌 Expected Output:</div><pre style="margin:0;background:#f5f5f5;padding:8px;border-radius:4px;border-left:3px solid #2196F3;white-space:pre-wrap;font-family:monospace;word-wrap:break-word;font-size:13px;">${escapeHtml(expectedOutput)}</pre></div>`;
            outputEl.innerHTML = html;
        }
        // Mark result as failed due to hardcoded output
        results[currentQuestionIndex].status = 'failed';
        results[currentQuestionIndex].errorMessage = 'Hardcoded output detected — no algorithm implementation';
        results[currentQuestionIndex].executionPhase = 'hardcoded-detection';
        lastRunResult = null;
        codeExecutedForCurrentQuestion = true;
        // Enable consent checkbox now that Run Code has been clicked
        enableConsentCheckboxIfQ1();
        saveCurrentOutputState();
        showToast('Hardcoded output detected! Please write actual logic.', 'error');
        return;
    }

    showLoading(true, currentLanguage === 'javascript' ? 'Running...' : 'Compiling & Running...');
    try {
        const endpoint = currentLanguage === 'java' ? '/api/execute/java' : currentLanguage === 'python' ? '/api/execute/python' : '/api/execute/javascript';
        const requestBody = { code };

        // Auto-detect stdin usage and provide test input from question example
        if (codeNeedsStdin(code, currentLanguage)) {
            const question = selectedQuestions[currentQuestionIndex];
            const testInput = extractTestInput(question);
            if (testInput) {
                requestBody.input = testInput;
                console.log('[RunCode] Detected stdin usage, providing test input:', JSON.stringify(testInput));
            }
        }

        const result = await apiCall('POST', endpoint, requestBody);

        codeExecutedForCurrentQuestion = true;
        // Enable consent checkbox now that Run Code has been clicked
        enableConsentCheckboxIfQ1();
        updateOutputDisplay(result, currentLanguage);

        if (result.success) {
            showToast('Code executed successfully', 'success');
        } else {
            const phase = result.phase || 'execution';
            showToast(phase === 'compilation' ? 'Compilation Error' : 'Runtime Error', 'error');
        }
    } catch (err) {
        showToast('Execution error: ' + err.message, 'error');
    } finally {
        showLoading(false);
    }
}

// ==================== AGENT ASSIST ====================
async function askAgent() {
    const question = selectedQuestions[currentQuestionIndex];
    const currentCode = window.editor.getValue();

    if (!codeExecutedForCurrentQuestion) {
        showToast('Please run your code first', 'warning');
        return;
    }

    // Check if output matches expected
    const expectedOutput = extractExpectedOutput(question);

    const questionOutputState = outputState[`q${question.id}`] || {};
    const currentOutput = questionOutputState?.[currentLanguage]?.lastRunResult?.actualOutput || '';
    const javaOutput = questionOutputState?.java?.lastRunResult?.actualOutput || '';
    const pythonOutput = questionOutputState?.python?.lastRunResult?.actualOutput || '';
    const jsOutput = questionOutputState?.javascript?.lastRunResult?.actualOutput || '';
    const strictOutputGate = isDeterministicExpectedOutput(expectedOutput);

    let languageToScore = currentLanguage;
    let codeToScore = currentCode;
    let outputMatched = strictOutputGate ? outputsMatch(currentOutput, expectedOutput) : true;

    if (strictOutputGate && !outputMatched) {
        const javaMatched = outputsMatch(javaOutput, expectedOutput);
        const pythonMatched = outputsMatch(pythonOutput, expectedOutput);
        const jsMatched = outputsMatch(jsOutput, expectedOutput);

        if (javaMatched || pythonMatched || jsMatched) {
            languageToScore = javaMatched ? 'java' : pythonMatched ? 'python' : 'javascript';
            codeToScore = codeState[`q${question.id}-${languageToScore}`] || '';
            outputMatched = true;
            showToast(`Using ${languageToScore.toUpperCase()} output for AI score`, 'info');
        }
    }

    if (strictOutputGate && !outputMatched) {
        // Keep the best previous score if one exists
        const prevBest = savedAgentPercentages[`q${question.id}`];
        if (prevBest !== undefined && prevBest > 0) {
            lastAgentPercentage = prevBest;
            showToast(`Output does not match expected (current run: 0%). Keeping best score: ${prevBest}%`, 'warning');
        } else {
            savedAgentPercentages[`q${question.id}`] = 0;
            results[currentQuestionIndex].agentScore = 0;
            lastAgentPercentage = 0;
            showToast('Output does not match expected - Agent score: 0%', 'warning');
        }
        return;
    }

    if (!strictOutputGate) {
        showToast('Non-deterministic expected output detected, skipping strict output gate', 'info');
    }

    agentRunning = true;
    agentAbortController = new AbortController();

    showLoading(true, 'AI Agent analyzing...');
    try {
        const response = await fetch('/api/agent/assist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                language: languageToScore,
                userCode: codeToScore || currentCode,
                questionTitle: question.title,
                questionDescription: question.description,
                lastError: results[currentQuestionIndex].errorMessage,
                outputMatched: true
            }),
            signal: agentAbortController.signal
        });

        if (!response.ok) throw new Error('Agent request failed');
        const data = await response.json();

        const agentState_lang = agentState[`q${question.id}`] || {};
        const prevLangBest = (agentState_lang[currentLanguage] && agentState_lang[currentLanguage].percentage) || 0;
        agentState_lang[currentLanguage] = {
            percentage: Math.max(prevLangBest, data.percentage || 0),
            explanation: data.explanation,
            agentUsed: data.agentUsed,
            agentStatus: data.agentStatus
        };
        agentState[`q${question.id}`] = agentState_lang;

        // Keep the highest score across multiple runs
        const prevBest = savedAgentPercentages[`q${question.id}`] || 0;
        const bestScore = Math.max(prevBest, data.percentage || 0);
        results[currentQuestionIndex].agentScore = bestScore;
        lastAgentPercentage = bestScore;
        savedAgentPercentages[`q${question.id}`] = bestScore;
        // Track which language achieved the best score and full result details
        if ((data.percentage || 0) >= prevBest) {
            savedAgentLanguages[`q${question.id}`] = languageToScore.toUpperCase();
            savedAgentCodeForReview[`q${question.id}`] = codeToScore || currentCode;
            savedAgentFullResults[`q${question.id}`] = {
                percentage: bestScore,
                explanation: data.explanation || '',
                agentUsed: data.agentUsed || CONFIG.primaryAgent,
                covered: data.covered || [],
                missed: data.missed || [],
                language: languageToScore.toUpperCase()
            };
            // Save code fingerprint for change detection in bulk analysis
            const jCode = codeState[`q${question.id}-java`] || '';
            const pCode = codeState[`q${question.id}-python`] || '';
            const jsCodeSnap = codeState[`q${question.id}-javascript`] || '';
            savedAgentCodeSnapshots[`q${question.id}`] = (jCode + '||' + pCode + '||' + jsCodeSnap).trim();
        }
        agentTotalAsks++;
        agentModeCounts.percentage++;

        if (data.percentage < prevBest) {
            showToast(`Current run: ${data.percentage}%. Keeping best score: ${prevBest}%`, 'info');
        }

        renderAgentResponse();
    } catch (err) {
        if (err.name !== 'AbortError') {
            showToast('Agent error: ' + err.message, 'error');
        }
    } finally {
        agentRunning = false;
        showLoading(false);
    }
}

function renderAgentResponse() {
    // No longer needed as a separate function — results are shown in agentAnalysisResults
}

// ==================== BULK ANALYSIS ====================
async function runBulkAnalysis() {
    showLoading(true, 'Running agent analysis on all questions...');
    bulkAnalysisResult = {};
    bulkAnalysisRunCount++;

    try {
        // Save current question state
        saveCurrentCode();
        saveCurrentOutputState();

        for (let i = 0; i < selectedQuestions.length; i++) {
            const question = selectedQuestions[i];
            const outputs = outputState[`q${question.id}`] || {};
            // Ensure javascript key exists (backwards compat for sessions started before JS was added)
            if (!outputs.javascript) outputs.javascript = '';
            const expectedOutput = extractExpectedOutput(question);
            const strictOutputGate = isDeterministicExpectedOutput(expectedOutput);

            // Get the code written by user
            const javaCode = codeState[`q${question.id}-java`] || '';
            const pythonCode = codeState[`q${question.id}-python`] || '';
            const jsCode = codeState[`q${question.id}-javascript`] || '';
            const javaTemplateCode = buildJavaStarterTemplate();
            const pythonTemplateCode = buildPythonStarterTemplate();
            const jsTemplateCode = buildJavaScriptStarterTemplate();
            
            // Skip if no code was actually written (only template remains)
            if ((javaCode === javaTemplateCode || javaCode.trim() === '') &&
                (pythonCode === pythonTemplateCode || pythonCode.trim() === '') &&
                (jsCode === jsTemplateCode || jsCode.trim() === '')) {
                bulkAnalysisResult[question.id] = { percentage: 0, explanation: 'No code written', agentUsed: 'ENHANCED-RULE-ENGINE', language: currentLanguage.toUpperCase() };
                continue;
            }

            // --- Determine the active language for this question ---
            // Use the currently selected language editor for ALL questions uniformly.
            // Whichever editor the user has open when they click "Agent Score"
            // is the language used to evaluate every question — even if some questions
            // have no code in that language (those will show 0%).
            let activeLanguage = currentLanguage;

            const activeCode = activeLanguage === 'java' ? javaCode : activeLanguage === 'python' ? pythonCode : jsCode;
            const activeTemplate = activeLanguage === 'java' ? javaTemplateCode : activeLanguage === 'python' ? pythonTemplateCode : jsTemplateCode;

            // Skip if the active language only has template code
            if (activeCode === activeTemplate || activeCode.trim() === '' || activeCode.trim().length <= 50) {
                bulkAnalysisResult[question.id] = { percentage: 0, explanation: 'No code written in ' + activeLanguage.toUpperCase(), agentUsed: 'ENHANCED-RULE-ENGINE', language: activeLanguage.toUpperCase() };
                continue;
            }

            // Check output for the active language
            const activeOutputObj = outputs[activeLanguage] || '';
            let activeOutput = '';
            if (typeof activeOutputObj === 'object' && activeOutputObj !== null) {
                if (activeOutputObj.lastRunResult) {
                    activeOutput = activeOutputObj.lastRunResult.actualOutput || '';
                } else {
                    try { activeOutput = JSON.stringify(activeOutputObj); } catch(e) { activeOutput = ''; }
                }
            } else {
                activeOutput = String(activeOutputObj || '');
            }
            if (activeOutput === '[object Object]') activeOutput = '';
            const activeMatches = outputsMatch(activeOutput, expectedOutput);

            if (strictOutputGate && !activeMatches) {
                bulkAnalysisResult[question.id] = {
                    percentage: 0,
                    explanation: 'Output does not match expected for ' + activeLanguage.toUpperCase() + '. Please run your code first.',
                    agentUsed: 'ENHANCED-RULE-ENGINE',
                    language: activeLanguage.toUpperCase()
                };
                continue;
            }

            // --- Cache: check if we already analyzed this exact code for this language ---
            const langFingerprint = activeLanguage + ':' + activeCode.trim();
            const prevLangFingerprint = savedAgentCodeSnapshots[`q${question.id}-${activeLanguage}`] || '';
            const langCodeChanged = langFingerprint !== prevLangFingerprint;

            if (!langCodeChanged && savedAgentFullResults[`q${question.id}-${activeLanguage}`]) {
                bulkAnalysisResult[question.id] = { ...savedAgentFullResults[`q${question.id}-${activeLanguage}`] };
                results[i].agentScore = bulkAnalysisResult[question.id].percentage;
                continue;
            }

            // --- Call agent for the active language ---
            const response = await fetch('/api/agent/assist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    language: activeLanguage,
                    userCode: activeCode,
                    questionTitle: question.title,
                    questionDescription: question.description,
                    lastError: results[i].errorMessage,
                    outputMatched: true
                })
            });

            if (response.ok) {
                const data = await response.json();
                const curScore = (typeof data.percentage === 'number') ? data.percentage : 0;
                const thisResult = {
                    percentage: curScore,
                    explanation: data.explanation || 'AI provider returned no score',
                    agentUsed: data.agentUsed || CONFIG.primaryAgent,
                    covered: data.covered || [],
                    missed: data.missed || [],
                    language: activeLanguage.toUpperCase()
                };

                bulkAnalysisResult[question.id] = thisResult;
                results[i].agentScore = curScore;
                agentTotalAsks++;

                // Cache per-language result
                savedAgentCodeSnapshots[`q${question.id}-${activeLanguage}`] = langFingerprint;
                savedAgentFullResults[`q${question.id}-${activeLanguage}`] = { ...thisResult };
                savedAgentPercentages[`q${question.id}`] = curScore;

                // Always update the summary tab to reflect the last language reviewed
                savedAgentLanguages[`q${question.id}`] = activeLanguage.toUpperCase();
                savedAgentCodeForReview[`q${question.id}`] = activeCode;
                savedAgentFullResults[`q${question.id}`] = { ...thisResult };
            } else {
                bulkAnalysisResult[question.id] = { percentage: 0, explanation: 'AI request failed', agentUsed: 'ENHANCED-RULE-ENGINE', language: activeLanguage.toUpperCase() };
            }
        }

        const completeBtn = document.querySelector('.nav-btn-complete');
        if (completeBtn) {
            completeBtn.removeAttribute('disabled');
            completeBtn.disabled = false;
            completeBtn.style.opacity = '1';
            completeBtn.style.pointerEvents = 'auto';
            completeBtn.style.cursor = 'pointer';
            completeBtn.title = 'Submit your results';
        }
        renderBulkAnalysisResults();
        showToast('Agent Score complete', 'success');
    } catch (err) {
        showToast('Bulk analysis error: ' + err.message, 'error');
    } finally {
        showLoading(false);
    }
}

function renderBulkAnalysisResults() {
    const container = document.getElementById('agentAnalysisResults');
    if (!container) return;
    
    // Compute averages
    let totalPct = 0;
    let count = 0;
    const aiLikelihoods = [];
    
    for (let i = 0; i < selectedQuestions.length; i++) {
        const q = selectedQuestions[i];
        const result = bulkAnalysisResult[q.id];
        if (result) {
            totalPct += result.percentage || 0;
            count++;
        }
        const javaCode = codeState[`q${q.id}-java`] || '';
        const pythonCode = codeState[`q${q.id}-python`] || '';
        const jsCode = codeState[`q${q.id}-javascript`] || '';
        const javaTemplate = buildJavaStarterTemplate();
        const pythonTemplate = buildPythonStarterTemplate();
        const jsTemplate = buildJavaScriptStarterTemplate();
        // Determine which language the user actually wrote code in
        // (if code differs from its starter template, the user modified it)
        const javaChanged = javaCode.trim() !== javaTemplate.trim() && javaCode.trim() !== '';
        const pythonChanged = pythonCode.trim() !== pythonTemplate.trim() && pythonCode.trim() !== '';
        const jsChanged = jsCode.trim() !== jsTemplate.trim() && jsCode.trim() !== '';
        const code = jsChanged ? jsCode : pythonChanged ? pythonCode : javaCode;
        const template = jsChanged ? jsTemplate : pythonChanged ? pythonTemplate : javaTemplate;
        const likelihood = computeAILikelihood(q.id, code, template);
        aiLikelihoods.push(likelihood);
    }
    
    const avgPct = count > 0 ? Math.round(totalPct / count) : 0;
    const avgAI = aiLikelihoods.length > 0 ? Math.round(aiLikelihoods.reduce((a, b) => a + (b.score || 0), 0) / aiLikelihoods.length) : 0;
    const aiColor = avgAI >= 60 ? '#d32f2f' : avgAI >= 30 ? '#FF9800' : '#4CAF50';
    const aiLabel = avgAI >= 60 ? 'High' : avgAI >= 30 ? 'Medium' : 'Low';

    let html = '<div style="text-align:left; max-width:500px; margin:0 auto;">';
    
    // Summary box
    html += `<div class="agent-summary-box">
        <strong>📊 Agent Score</strong>
        <p>Questions Analyzed: <strong>${count}</strong> / ${selectedQuestions.length}</p>
        <p>Average Code Correctness: <strong>${avgPct}%</strong></p>
        <p>🔍 Plagiarism: <strong style="color:${aiColor}">${avgAI}% (${aiLabel})</strong></p>
    </div>`;

    // Per-question results
    for (let i = 0; i < selectedQuestions.length; i++) {
        const q = selectedQuestions[i];
        const result = bulkAnalysisResult[q.id] || { percentage: 0, explanation: 'Not analyzed' };
        const likelihood = aiLikelihoods[i] || { score: 0, reasons: [] };
        
        const pctColor = result.percentage >= 70 ? '#4CAF50' : result.percentage >= 40 ? '#FF9800' : '#d32f2f';
        const qAiColor = likelihood.score >= 60 ? '#d32f2f' : likelihood.score >= 30 ? '#FF9800' : '#4CAF50';
        const qAiLabel = likelihood.score >= 60 ? 'High' : likelihood.score >= 30 ? 'Medium' : 'Low';
        
        const scoredLang = result.language || currentLanguage.toUpperCase();
        html += `<div class="result-item">
            <strong>${i + 1}. ${escapeHtml(q.title)}</strong>
            ${scoredLang ? `<p style="font-size:0.9em; color:#1976D2;">💻 Language: <strong>${escapeHtml(scoredLang)}</strong></p>` : ''}
            ${result.agentUsed ? `<p style="font-size:0.85em; color:#555;">🤖 Agent: <strong>${escapeHtml(result.agentUsed)}</strong></p>` : ''}
            <p>Agent Score: <span style="color:${pctColor}; font-weight:bold;">${result.percentage}%</span></p>
            <p>🔍 Plagiarism: <span style="color:${qAiColor}; font-weight:bold;">${likelihood.score}% (${qAiLabel})</span></p>
            ${likelihood.reasons.length > 0 ? `<p style="font-size:0.85em; color:#666; margin:2px 0 0 0;">Reasons: ${likelihood.reasons.join('; ')}</p>` : ''}
            ${result.covered && result.covered.length > 0 ? `<div style="margin:6px 0 2px 0;"><strong style="color:#4CAF50; font-size:0.9em;">✅ Covered:</strong><ul style="margin:2px 0 4px 18px; padding:0; font-size:0.85em; color:#444;">${result.covered.map(c => `<li>${escapeHtml(c)}</li>`).join('')}</ul></div>` : ''}
            ${result.missed && result.missed.length > 0 ? `<div style="margin:2px 0 6px 0;"><strong style="color:#d32f2f; font-size:0.9em;">❌ Missed:</strong><ul style="margin:2px 0 4px 18px; padding:0; font-size:0.85em; color:#444;">${result.missed.map(m => `<li>${escapeHtml(m)}</li>`).join('')}</ul></div>` : ''}
            ${!result.covered?.length && !result.missed?.length && result.explanation ? `<p class="agent-analysis-detail">${escapeHtml(result.explanation.substring(0, 300))}</p>` : ''}
        </div>`;
    }

    html += '</div>';
    
    container.innerHTML = html;
    container.style.display = 'block';
    bulkAnalysisRenderedHtml = html;
}

// ==================== TIMER MANAGEMENT ====================

function startQuestionTimer() {
    const question = selectedQuestions[currentQuestionIndex];
    questionTimerInterval = setInterval(() => {
        questionTimeLeft[question.id] = Math.max(0, questionTimeLeft[question.id] - 1);
        updateQuestionTimerDisplay();

        if (questionTimeLeft[question.id] === CONFIG.timerWarningAt) {
            // playTimerAlert();  // Sound disabled
            showTimerWarning('⏱️ Last 1 minute remaining!');
        }

        if (questionTimeLeft[question.id] === CONFIG.timerCountdownAt) {
            showTimerWarning(`⏱️ ${CONFIG.timerCountdownAt}s remaining!`);
        }

        if (questionTimeLeft[question.id] > 0 && questionTimeLeft[question.id] <= 10) {
            // playTimerBeep();  // Sound disabled
        }

        if (questionTimeLeft[question.id] === 0) {
            clearInterval(questionTimerInterval);
            lockQuestion();
        }

        calculateTotalTime();
    }, 1000);
}

function updateQuestionTimerDisplay() {
    const question = selectedQuestions[currentQuestionIndex];
    const timeLeft = questionTimeLeft[question.id];
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    const display = `⏱ ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    const timer = document.getElementById('questionTimer');
    if (!timer) return;
    timer.textContent = display;
    timer.classList.remove('timer-warning', 'timer-expired');
    if (timeLeft <= 0) {
        timer.classList.add('timer-expired');
    } else if (timeLeft <= CONFIG.timerWarningAt) {
        timer.classList.add('timer-warning');
    }
}

function showTimerWarning(message) {
    const popup = document.getElementById('timerWarningPopup');
    if (!popup) return;
    popup.textContent = message;
    popup.classList.remove('hidden');
    setTimeout(() => popup.classList.add('hidden'), 3000);
}

function lockQuestion() {
    lockCodeEditor();
    
    // Enable Next button if it was disabled
    const nextBtn = document.querySelector('.nav-btn-next');
    if (nextBtn) nextBtn.disabled = false;

    saveCurrentCode();
    saveCurrentOutputState();

    showToast('⏳ Time up for this question!', 'warning');
    showTimerWarning('⏳ Time up for the question!');
    
    // Find next question with time remaining
    let nextWithTime = -1;
    for (let i = 0; i < selectedQuestions.length; i++) {
        if (i !== currentQuestionIndex && questionTimeLeft[selectedQuestions[i].id] > 0) {
            nextWithTime = i;
            break;
        }
    }
    
    setTimeout(() => {
        if (nextWithTime >= 0) {
            clearInterval(questionTimerInterval);
            currentQuestionIndex = nextWithTime;
            loadQuestion();
            startQuestionTimer();
        } else if (currentQuestionIndex === selectedQuestions.length - 1) {
            // On last question, all timers done
            showToast('All timers completed! Click 📊 Agent Score', 'warning');
        } else {
            // Not on last question but all timers done — go to last question
            clearInterval(questionTimerInterval);
            currentQuestionIndex = selectedQuestions.length - 1;
            loadQuestion();
            startQuestionTimer();
        }
    }, 1500);
}

// Spec Section 13: Lock editor when question timer expires
function lockCodeEditor() {
    if (window.editor) {
        window.editor.setOption('readOnly', true);
        const wrapper = window.editor.getWrapperElement();
        if (wrapper) wrapper.style.opacity = '0.6';
    }
}

// Spec Section 13: Unlock editor when loading a question with time remaining
function unlockCodeEditor() {
    if (window.editor) {
        window.editor.setOption('readOnly', false);
        const wrapper = window.editor.getWrapperElement();
        if (wrapper) wrapper.style.opacity = '1';
    }
}

// Spec Section 21: Clear code and reset output
function clearCode() {
    if (window.editor) {
        window.editor.setValue('');
    }
    lastRunResult = null;
    const outputEl = document.getElementById('output');
    const sectionEl = document.getElementById('outputSection');
    if (outputEl) outputEl.textContent = 'Ready to run...';
    if (sectionEl) {
        sectionEl.className = 'output-section';
        sectionEl.dataset.validationStatus = '';
    }
    lastExecutionError = '';
    saveCurrentOutputState();
}

// Spec Section 22: Get current output text
function getCurrentOutputText() {
    const output = document.getElementById('output');
    if (!output) return '';
    return output.textContent || '';
}

// Spec Section 25: Invalidate agent analysis when code is edited after analysis
function onCodeEditedAfterAnalysis() {
    codeExecutedForCurrentQuestion = false;

    const question = selectedQuestions[currentQuestionIndex];
    if (question) {
        delete savedAgentPercentages[`q${question.id}`];
        delete savedAgentLanguages[`q${question.id}`];
        delete savedAgentFullResults[`q${question.id}`];
        delete savedAgentCodeSnapshots[`q${question.id}`];
        delete savedAgentCodeForReview[`q${question.id}`];
    }

    if (bulkAnalysisResult) {
        bulkAnalysisResult = null;
        bulkAnalysisRenderedHtml = '';

        const completeBtn = document.querySelector('.nav-btn-complete');
        if (completeBtn) {
            completeBtn.disabled = true;
            completeBtn.style.opacity = '0.5';
            completeBtn.style.pointerEvents = 'none';
            completeBtn.title = 'Run code & Agent Code Analysis again after editing';
        }

        const analysisContainer = document.getElementById('agentAnalysisResults');
        if (analysisContainer) {
            analysisContainer.style.display = 'none';
            analysisContainer.innerHTML = '';
        }
    }
}

function startSessionTimer() {
    sessionTimerInterval = setInterval(() => {
        totalElapsedSeconds++;
        calculateTotalTime();
    }, 1000);
}

function calculateTotalTime() {
    try {
        totalTimeRemaining = Object.values(questionTimeLeft).reduce((a, b) => a + b, 0);
        const hours = Math.floor(totalTimeRemaining / 3600);
        const minutes = Math.floor((totalTimeRemaining % 3600) / 60);
        const seconds = totalTimeRemaining % 60;
        
        const timerText = document.getElementById('totalTimerText');
        const timerEl = document.getElementById('totalTimer');
        if (timerText) {
            if (hours > 0) {
                timerText.textContent = `⏱ Total: ${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            } else {
                timerText.textContent = `⏱ Total: ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
        }
        if (timerEl) {
            timerEl.classList.toggle('timer-warning', totalTimeRemaining <= 60);
        }
    } catch (err) {
        console.error('Error in calculateTotalTime:', err);
    }
}

// ==================== AUTO-SAVE ====================

function startAutoSave() {
    autoSaveInterval = setInterval(() => {
        saveSession();
    }, CONFIG.autoSaveIntervalMs);
}

// ==================== TAB SWITCH DETECTION ====================

document.addEventListener('visibilitychange', () => {
    // Don't track tab switches after assessment is submitted (e.g., on performance summary page)
    if (assessmentSubmitted) {
        return;
    }
    // Only track tab switches if an assessment is in progress
    if (!selectedQuestions || selectedQuestions.length === 0 || currentQuestionIndex >= selectedQuestions.length) {
        return;
    }
    
    if (document.hidden) {
        // User is leaving the tab - snapshot code and mark as in progress
        tabSwitchInProgress = true;

        // Snapshot current code for diff calculation on return
        if (selectedQuestions && selectedQuestions.length > 0 && currentQuestionIndex < selectedQuestions.length) {
            const question = selectedQuestions[currentQuestionIndex];
            if (question) {
                const metrics = typingMetrics[question.id];
                if (metrics && window.editor) {
                    try {
                        metrics.codeSnapshotBeforeTabSwitch = window.editor.getValue();
                    } catch (e) {
                        console.warn('Error snapshotting code on tab leave:', e);
                    }
                }
            }
        }
    } else {
        // User is returning to the tab - only increment if they actually left
        if (tabSwitchInProgress) {
            tabSwitchCount++;
            tabSwitchInProgress = false;
            
            // Show popup alert for tab switch only if not yet at limit
            if (tabSwitchCount < CONFIG.tabSwitchFreezeLimit) {
                const timesText = tabSwitchCount === 1 ? 'time' : 'times';
                alert(`⚠️ Tab switch detected!\n\nYou have switched ${tabSwitchCount} ${timesText}.\n\nThis will lead to your assessment being stopped if this is repeated.`);
            }
            
            const question = selectedQuestions[currentQuestionIndex];
            if (!question) {
                return;
            }
            
            const metrics = typingMetrics[question.id];
            if (metrics && window.editor) {
                try {
                    const currentCode = window.editor.getValue();
                    const snapshotLen = (metrics.codeSnapshotBeforeTabSwitch || '').length;
                    const codeDiff = currentCode.length - snapshotLen;
                    metrics.tabSwitchCodeDiffs.push(codeDiff);
                    metrics.tabSwitchTimestamps.push(Date.now());
                    metrics.charsAfterEachTabSwitch.push(Math.max(codeDiff, 0));
                } catch (err) {
                    console.warn('Error tracking tab switch:', err);
                }
            }

            updateTabSwitchWarning();

            if (tabSwitchCount >= CONFIG.tabSwitchFreezeLimit) {
                freezeAssessment();
            }
        }
    }
});

// ==================== PAGE-LEVEL CLIPBOARD BLOCKING ====================
// Block copy/paste/context-menu at the document level when copy-paste is disabled
document.addEventListener('copy', (e) => {
    if (!CONFIG.copyPasteEnabled) e.preventDefault();
});
document.addEventListener('paste', (e) => {
    if (!CONFIG.copyPasteEnabled) e.preventDefault();
});
document.addEventListener('contextmenu', (e) => {
    if (!CONFIG.copyPasteEnabled) e.preventDefault();
});

function updateTabSwitchWarning() {
    const warning = document.getElementById('tabSwitchWarning');
    if (!warning) return;
    if (tabSwitchCount > 0 && tabSwitchCount < CONFIG.tabSwitchFreezeLimit) {
        warning.classList.remove('hidden');
        const timesText = tabSwitchCount === 1 ? 'time' : 'times';
        warning.textContent = `⚠️ Tab switch ${tabSwitchCount} ${timesText}`;
    } else {
        warning.classList.add('hidden');
    }
}

function freezeAssessment() {
    // Immediately mark as submitted to prevent further tab switch alerts
    assessmentSubmitted = true;

    if (window.editor) {
        window.editor.setOption('readOnly', true);
        const wrapper = window.editor.getWrapperElement();
        if (wrapper) wrapper.style.opacity = '0.6';
    }
    
    // Disable all dynamic buttons
    document.querySelectorAll('.question-nav-buttons button').forEach(btn => btn.disabled = true);
    document.querySelectorAll('.editor-buttons button').forEach(btn => btn.disabled = true);
    
    // Hide tab switch warning
    const warning = document.getElementById('tabSwitchWarning');
    if (warning) warning.classList.add('hidden');
    
    alert('⛔ Tab switch detected. Your assessment is now locked and submitted.');
    
    setTimeout(() => {
        submitAssessment();
    }, 2000);
}

// ==================== NAVIGATION ====================
function previousQuestion() {
    if (currentQuestionIndex <= 0) return;
    
    // Check if previous question's timer expired
    const prevQuestion = selectedQuestions[currentQuestionIndex - 1];
    if (questionTimeLeft[prevQuestion.id] <= 0) {
        showToast("Previous question timer is done, can't move to previous one", 'error');
        return;
    }
    
    saveCurrentCode();
    saveCurrentOutputState();
    
    clearInterval(questionTimerInterval);
    currentQuestionIndex--;
    loadQuestion();
    startQuestionTimer();
    saveSession();
}

function nextQuestion() {
    if (currentQuestionIndex >= selectedQuestions.length - 1) return;

    const isFirst = currentQuestionIndex === 0;

    // For Q1: require consent checkbox
    if (isFirst) {
        const consentCb = document.getElementById('questionConsentCheckbox');
        if (!consentCb || !consentCb.checked) {
            showToast('Please check the consent box before moving to the next question.', 'error');
            return;
        }

        // Record Q1 completion time
        const question = selectedQuestions[currentQuestionIndex];
        const difficulty = (question.difficulty || '').toLowerCase();
        const totalAllotted = CONFIG.questionTimeLimits[difficulty] || CONFIG.defaultTimeLimit;
        const timeSpent = totalAllotted - (questionTimeLeft[question.id] || 0);
        questionCompletionTimes[question.id] = timeSpent;

        // Set Q1 timer to 0 so total timer reflects only remaining questions
        questionTimeLeft[question.id] = 0;
        calculateTotalTime();
    }
    
    saveCurrentCode();
    saveCurrentOutputState();
    
    clearInterval(questionTimerInterval);
    currentQuestionIndex++;
    loadQuestion();
    startQuestionTimer();
    saveSession();
}

// Enable consent checkbox after Run Code has been clicked on Q1
function enableConsentCheckboxIfQ1() {
    if (currentQuestionIndex !== 0) return;
    const consentCb = document.getElementById('questionConsentCheckbox');
    if (consentCb && consentCb.disabled) {
        consentCb.disabled = false;
        consentCb.style.cursor = 'pointer';
        const hint = document.getElementById('consentRunCodeHint');
        if (hint) hint.style.display = 'none';
    }
}

// Handle consent checkbox change for question navigation
function handleQuestionConsentChange() {
    const consentCb = document.getElementById('questionConsentCheckbox');
    const consentBox = document.getElementById('questionConsentBox');
    const moveBtn = document.getElementById('moveToNextBtn');

    // Block consent if Run Code hasn't been clicked yet on Q1
    if (consentCb && consentCb.checked && !codeExecutedForCurrentQuestion && currentQuestionIndex === 0) {
        consentCb.checked = false;
        showToast('Please click "Run Code" at least once before proceeding.', 'error');
        return;
    }

    if (consentCb && consentBox) {
        if (consentCb.checked) {
            consentBox.classList.add('checked');
        } else {
            consentBox.classList.remove('checked');
        }
    }
    if (moveBtn) {
        if (consentCb && consentCb.checked) {
            moveBtn.disabled = false;
            moveBtn.style.opacity = '1';
            moveBtn.style.cursor = 'pointer';
            moveBtn.title = 'Click to move to the next question';
        } else {
            moveBtn.disabled = true;
            moveBtn.style.opacity = '0.5';
            moveBtn.style.cursor = 'not-allowed';
            moveBtn.title = 'Please check the consent box above to proceed';
        }
    }
}

function completeProgram() {
    // Save current state
    saveCurrentCode();
    saveCurrentOutputState();
    
    // Submit the assessment
    submitAssessment();
}

// ==================== SUBMISSION ==
async function submitAssessment() {
    assessmentSubmitted = true;
    clearInterval(questionTimerInterval);
    clearInterval(autoSaveInterval);
    clearInterval(sessionTimerInterval);

    if (window.editor) window.editor.setOption('readOnly', true);
    
    // Disable all dynamic buttons
    document.querySelectorAll('.editor-buttons button').forEach(btn => btn.disabled = true);
    document.querySelectorAll('.question-nav-buttons button').forEach(btn => btn.disabled = true);
    
    // Hide total timer and reset position
    const totalTimerEl = document.getElementById('totalTimer');
    if (totalTimerEl) {
        totalTimerEl.classList.add('hidden');
        if (totalTimerEl._dragCleanup) totalTimerEl._dragCleanup();
        resetTimerPosition();
    }

    // Hide tab switch warning banner on performance summary page
    const tabSwitchWarningEl = document.getElementById('tabSwitchWarning');
    if (tabSwitchWarningEl) tabSwitchWarningEl.classList.add('hidden');

    programsCompleted = results.filter(r => r.status === 'completed').length;

    // Calculate Plagiarism scores
    const aiLikelihoods = selectedQuestions.map((q, idx) => {
        const javaCode = codeState[`q${q.id}-java`] || '';
        const pythonCode = codeState[`q${q.id}-python`] || '';
        const jsCode = codeState[`q${q.id}-javascript`] || '';
        const javaTemplate = buildJavaStarterTemplate();
        const pythonTemplate = buildPythonStarterTemplate();
        const jsTemplate = buildJavaScriptStarterTemplate();
        const pythonChanged = pythonCode.trim() !== pythonTemplate.trim() && pythonCode.trim() !== '';
        const jsChanged = jsCode.trim() !== jsTemplate.trim() && jsCode.trim() !== '';
        const code = jsChanged ? jsCode : pythonChanged ? pythonCode : javaCode;
        const template = jsChanged ? jsTemplate : pythonChanged ? pythonTemplate : javaTemplate;
        return computeAILikelihood(q.id, code, template);
    });

    // Compute agent analysis summary
    let analyzedCount = 0;
    let totalAgentPct = 0;
    if (bulkAnalysisResult) {
        for (const q of selectedQuestions) {
            const r = bulkAnalysisResult[q.id];
            if (r) { analyzedCount++; totalAgentPct += (r.percentage || 0); }
        }
    }
    const avgAgentPct = analyzedCount > 0 ? Math.round(totalAgentPct / analyzedCount) : 0;

    // Compute Plagiarism stats
    const aiScores = aiLikelihoods.map(l => l.score || 0);
    const avgAI = aiScores.length > 0 ? Math.round(aiScores.reduce((a, b) => a + b, 0) / aiScores.length) : 0;
    const maxAI = Math.max(...aiScores, 0);

    // Build per-question result objects with full data
    // Use the LAST language used for Agent Score per question (savedAgentLanguages)
    // and pull actual output from outputState for that specific language so the
    // Candidate Performance tab reflects the reviewed language, not just the last run.
    const fullResults = selectedQuestions.map((q, idx) => {
        const r = results[idx];
        const likelihood = aiLikelihoods[idx] || { score: 0, reasons: [] };
        const agentResult = bulkAnalysisResult ? (bulkAnalysisResult[q.id] || null) : null;

        // Priority: savedAgentLanguages (last AI reviewed) > agentResult.language > currentLanguage
        const lang = savedAgentLanguages[`q${q.id}`]
            ? savedAgentLanguages[`q${q.id}`].toLowerCase()
            : (agentResult && agentResult.language) ? agentResult.language.toLowerCase()
            : currentLanguage;

        // Use the code snapshot from the last AI review if available
        const code = savedAgentCodeForReview[`q${q.id}`] || codeState[`q${q.id}-${lang}`] || codeState[`q${q.id}-java`] || '';
        const attempted = code.trim().length > 50;

        // Pull actual output for the AI-reviewed language from outputState
        const qOutputState = outputState[`q${q.id}`] || {};
        const langOutputObj = qOutputState[lang] || '';
        let langActualOutput = '';
        if (typeof langOutputObj === 'object' && langOutputObj !== null) {
            if (langOutputObj.lastRunResult) {
                langActualOutput = langOutputObj.lastRunResult.actualOutput || '';
            } else {
                try { langActualOutput = JSON.stringify(langOutputObj); } catch(e) { langActualOutput = ''; }
            }
        } else {
            langActualOutput = String(langOutputObj || '');
        }
        if (langActualOutput === '[object Object]') langActualOutput = '';

        // Determine completion status based on the AI-reviewed language's output
        const expectedOutput = r.expectedOutput || extractExpectedOutput(q);
        const langOutputMatches = outputsMatch(langActualOutput, expectedOutput);
        const langCompleted = langOutputMatches && langActualOutput.trim().length > 0;

        // Get per-question tab switch count from typing metrics
        const qTabSwitchCount = (typingMetrics[q.id] && typingMetrics[q.id].tabSwitchTimestamps)
            ? typingMetrics[q.id].tabSwitchTimestamps.length : 0;
        // Compute per-question time spent
        const qDifficulty = (q.difficulty || '').toLowerCase();
        const qTotalAllotted = CONFIG.questionTimeLimits[qDifficulty] || CONFIG.defaultTimeLimit;
        const qTimeSpent = questionCompletionTimes[q.id] !== undefined
            ? questionCompletionTimes[q.id]
            : (qTotalAllotted - (questionTimeLeft[q.id] || 0));
        return {
            questionId: q.id,
            title: q.title,
            description: q.description || '',
            completed: langCompleted,
            language: lang,
            code: code,
            expectedOutput: expectedOutput,
            actualOutput: langActualOutput,
            validationMessage: langCompleted ? 'Output matches expected' : (r.errorMessage || 'Output does not match'),
            attempted: attempted,
            agentPercentage: agentResult ? (agentResult.percentage || 0) : (r.agentScore || 0),
            agentSuggestion: agentResult ? (agentResult.explanation || '') : '',
            agentCovered: agentResult ? (agentResult.covered || []) : [],
            agentMissed: agentResult ? (agentResult.missed || []) : [],
            aiLikelihood: likelihood.score,
            aiReasons: likelihood.reasons,
            tabSwitchCount: qTabSwitchCount,
            questionTimeSpent: qTimeSpent
        };
    });

    // Format total time
    const formatTime = (sec) => {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;
        return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${m}:${String(s).padStart(2,'0')}`;
    };

    // Recalculate programsCompleted based on the AI-reviewed language's status
    programsCompleted = fullResults.filter(r => r.completed).length;

    showLoading(true, 'Saving results...');
    try {
        await apiCall('POST', '/api/result', {
            personName: personName,
            email: authEmail,
            location: candidateLocation,
            experienceYears: experienceRaw,
            preferredLanguage: lockedLanguage || currentLanguage,
            programsCompleted: programsCompleted,
            totalPrograms: totalPrograms,
            results: fullResults,
            tabSwitchCount: tabSwitchCount,
            totalTimeTaken: totalElapsedSeconds,
            agentAnalysis: {
                analyzedCount: analyzedCount,
                averagePercentage: avgAgentPct
            },
            aiLikelihood: {
                average: avgAI,
                highest: maxAI,
                perQuestion: selectedQuestions.map((q, idx) => ({
                    questionId: q.id,
                    title: q.title,
                    score: aiLikelihoods[idx].score,
                    reasons: aiLikelihoods[idx].reasons
                }))
            }
        });

        displayResults(aiLikelihoods);
        clearSession();
    } catch (err) {
        showToast('Failed to save results: ' + err.message, 'error');
    } finally {
        showLoading(false);
    }
}

function displayResults(aiLikelihoods) {
    // Simply show the thank-you page — no performance details shown to candidates
    showStep(4);
}

// ==================== RESULTS ACTIONS ====================
document.getElementById('backHomeBtn').addEventListener('click', () => {
    location.reload();
});

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
            const result = await apiCall('POST', '/api/feedback', {
                candidateName: personName,
                candidateEmail: authEmail,
                feedback: text
            });
            feedbackStatus.textContent = '✅ ' + (result.message || 'Feedback submitted successfully!');
            feedbackStatus.className = 'feedback-status success';
            feedbackText.value = '';
            // Auto-hide form after 3 seconds
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

// ==================== FILTERABLE TABLE BUILDER ====================
function buildFilterableTablePage(opts) {
    const { title, subtitle, headers, rows, downloadFileName, summaryUnit } = opts;
    const totalCount = rows.length;

    // Build table header cells
    let thHtml = '';
    headers.forEach((h, i) => {
        thHtml += `<th>${escapeHtml(h)}<br><button class="filter-btn" data-col="${i}" onclick="toggleDropdown(${i},event)">▼</button>
        <div class="filter-dropdown" id="fd-${i}">
            <input type="text" class="filter-search" placeholder="Search..." oninput="filterCheckboxes(${i},this.value)">
            <label class="filter-option"><input type="checkbox" checked onchange="toggleSelectAll(${i},this.checked)"> (Select All)</label>
            <div class="filter-list" id="fl-${i}"></div>
            <div class="filter-actions">
                <button class="filter-ok" onclick="applyFilter(${i})">OK</button>
                <button class="filter-cancel" onclick="closeDropdown(${i})">Cancel</button>
            </div>
        </div></th>`;
    });

    // Build table body rows
    let tbodyHtml = '';
    rows.forEach((row, ri) => {
        let tds = '';
        headers.forEach(h => {
            tds += `<td>${escapeHtml(row[h] || '')}</td>`;
        });
        tbodyHtml += `<tr>${tds}</tr>`;
    });

    // Serialize rows data for JS
    const rowsJson = JSON.stringify(rows);
    const headersJson = JSON.stringify(headers);

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
body{font-family:'Segoe UI',Arial,sans-serif;margin:20px;background:#f5f5f5;color:#333;}
h2{color:#333;margin-bottom:5px;}
.toolbar{display:flex;align-items:center;gap:15px;flex-wrap:wrap;margin-bottom:15px;}
.toolbar .subtitle{color:#666;font-size:14px;}
.download-btn{background:#217346;color:#fff;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;font-size:14px;display:inline-flex;align-items:center;gap:6px;}
.download-btn:hover{background:#1a5c38;}
.clear-btn{background:#e53935;color:#fff;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;font-size:14px;}
.clear-btn:hover{background:#c62828;}
.summary-text{color:#666;font-size:13px;margin-bottom:10px;}
table{border-collapse:collapse;width:100%;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.1);border-radius:8px;overflow:hidden;border:2px solid #1a73e8;}
th{background:#1a73e8;color:#fff;padding:8px 10px;text-align:center;font-size:13px;white-space:nowrap;border:1px solid #1558b0;position:relative;vertical-align:top;}
td{padding:10px 15px;border:1px solid #d0d0d0;font-size:13px;text-align:center;}
tr:nth-child(even){background:#f0f4ff;}
tr:nth-child(odd){background:#fff;}
tr:hover{background:#e3ecfa;}
.filter-btn{background:none;border:1px solid rgba(255,255,255,0.4);color:#fff;cursor:pointer;font-size:10px;padding:2px 5px;border-radius:3px;margin-left:4px;}
.filter-btn:hover{background:rgba(255,255,255,0.2);}
.filter-btn.active{background:rgba(255,255,255,0.35);}
.filter-dropdown{display:none;position:absolute;top:100%;left:0;z-index:1000;background:#fff;border:1px solid #ccc;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,0.18);min-width:200px;max-height:320px;text-align:left;color:#333;}
.filter-dropdown.open{display:block;}
.filter-search{width:calc(100% - 16px);margin:8px;padding:6px 8px;border:1px solid #ccc;border-radius:4px;font-size:12px;box-sizing:border-box;}
.filter-option{display:block;padding:3px 10px;font-size:12px;cursor:pointer;white-space:nowrap;}
.filter-option:hover{background:#f0f0f0;}
.filter-list{max-height:180px;overflow-y:auto;}
.filter-actions{display:flex;gap:6px;padding:8px;border-top:1px solid #eee;}
.filter-ok{flex:1;padding:6px;background:#1a73e8;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;}
.filter-cancel{flex:1;padding:6px;background:#eee;color:#333;border:none;border-radius:4px;cursor:pointer;font-size:12px;}
.table-container{overflow-x:auto;}
</style></head><body>
<h2>${escapeHtml(title)}</h2>
<div class="toolbar">
    <span class="subtitle">${escapeHtml(subtitle)}</span>
    <button class="download-btn" onclick="downloadCsv()">📥 Download as CSV</button>
    <button class="clear-btn" onclick="clearAllFilters()">✕ Clear Filters</button>
</div>
<div class="summary-text" id="summaryText">Showing ${totalCount} of ${totalCount} ${summaryUnit}</div>
<div class="table-container">
<table><thead><tr>${thHtml}</tr></thead><tbody id="tableBody">${tbodyHtml}</tbody></table>
</div>
<script>
var allHeaders = ${headersJson};
var allRows = ${rowsJson};
var totalCount = ${totalCount};
var summaryUnit = '${summaryUnit}';
var colFilters = {};
var openDropdownIdx = null;

// Build unique values for each column
function getUniqueValues(colIdx) {
    var h = allHeaders[colIdx];
    var vals = new Set();
    allRows.forEach(function(r){ vals.add(r[h] || ''); });
    return Array.from(vals).sort();
}

function toggleDropdown(colIdx, evt) {
    evt.stopPropagation();
    if (openDropdownIdx !== null && openDropdownIdx !== colIdx) {
        closeDropdown(openDropdownIdx);
    }
    var dd = document.getElementById('fd-' + colIdx);
    var isOpen = dd.classList.contains('open');
    if (isOpen) { closeDropdown(colIdx); return; }
    
    // Populate checkboxes
    var list = document.getElementById('fl-' + colIdx);
    var vals = getUniqueValues(colIdx);
    var activeSet = colFilters[colIdx];
    list.innerHTML = '';
    vals.forEach(function(v) {
        var checked = !activeSet || activeSet.has(v);
        var lbl = document.createElement('label');
        lbl.className = 'filter-option';
        lbl.setAttribute('data-val', v.toLowerCase());
        lbl.innerHTML = '<input type="checkbox" value="' + v.replace(/"/g,'&quot;') + '"' + (checked ? ' checked' : '') + '> ' + (v || '(empty)');
        list.appendChild(lbl);
    });
    
    dd.classList.add('open');
    openDropdownIdx = colIdx;
}

function closeDropdown(colIdx) {
    var dd = document.getElementById('fd-' + colIdx);
    if (dd) dd.classList.remove('open');
    if (openDropdownIdx === colIdx) openDropdownIdx = null;
}

function filterCheckboxes(colIdx, searchVal) {
    var list = document.getElementById('fl-' + colIdx);
    var labels = list.querySelectorAll('.filter-option');
    var sv = searchVal.toLowerCase();
    labels.forEach(function(lbl) {
        lbl.style.display = lbl.getAttribute('data-val').indexOf(sv) >= 0 ? '' : 'none';
    });
}

function toggleSelectAll(colIdx, checked) {
    var list = document.getElementById('fl-' + colIdx);
    list.querySelectorAll('input[type=checkbox]').forEach(function(cb) {
        if (cb.parentElement.style.display !== 'none') cb.checked = checked;
    });
}

function applyFilter(colIdx) {
    var list = document.getElementById('fl-' + colIdx);
    var cbs = list.querySelectorAll('input[type=checkbox]');
    var allChecked = true;
    var selectedSet = new Set();
    cbs.forEach(function(cb) {
        if (cb.checked) selectedSet.add(cb.value);
        else allChecked = false;
    });
    
    if (allChecked) { colFilters[colIdx] = null; }
    else { colFilters[colIdx] = selectedSet; }
    
    // Update filter button style
    var btn = document.querySelector('.filter-btn[data-col="' + colIdx + '"]');
    if (btn) btn.className = colFilters[colIdx] ? 'filter-btn active' : 'filter-btn';
    
    closeDropdown(colIdx);
    applyAllFilters();
}

function applyAllFilters() {
    var tbody = document.getElementById('tableBody');
    var trs = tbody.querySelectorAll('tr');
    var visibleCount = 0;
    trs.forEach(function(tr) {
        var tds = tr.querySelectorAll('td');
        var show = true;
        for (var ci in colFilters) {
            if (!colFilters[ci]) continue;
            var cellVal = tds[ci] ? tds[ci].textContent : '';
            if (!colFilters[ci].has(cellVal)) { show = false; break; }
        }
        tr.style.display = show ? '' : 'none';
        if (show) visibleCount++;
    });
    document.getElementById('summaryText').textContent = 'Showing ' + visibleCount + ' of ' + totalCount + ' ' + summaryUnit;
}

function clearAllFilters() {
    colFilters = {};
    document.querySelectorAll('.filter-btn').forEach(function(b){ b.className = 'filter-btn'; });
    var tbody = document.getElementById('tableBody');
    tbody.querySelectorAll('tr').forEach(function(tr){ tr.style.display = ''; });
    document.getElementById('summaryText').textContent = 'Showing ' + totalCount + ' of ' + totalCount + ' ' + summaryUnit;
}

function escapeCsvField(val) {
    if (val == null) return '';
    var s = String(val).replace(/\\r\\n|\\n|\\r/g, ' ');
    if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf(' ') >= 0) {
        s = '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
}

function downloadCsv() {
    var lines = [allHeaders.map(escapeCsvField).join(',')];
    allRows.forEach(function(row) {
        lines.push(allHeaders.map(function(h){ return escapeCsvField(row[h] || ''); }).join(','));
    });
    var csv = lines.join('\\n');
    var blob = new Blob([csv], {type:'text/csv'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '${downloadFileName}';
    a.click();
    URL.revokeObjectURL(url);
}

// Close dropdown on outside click
document.addEventListener('click', function(e) {
    if (openDropdownIdx !== null) {
        var dd = document.getElementById('fd-' + openDropdownIdx);
        if (dd && !dd.contains(e.target) && !e.target.classList.contains('filter-btn')) {
            closeDropdown(openDropdownIdx);
        }
    }
});
</script></body></html>`;
}

// ==================== PIE CHART RENDERING ====================
function renderCandidatesPieChart(labels, values, colors) {
    const container = document.getElementById('candidatesPieChartContainer');
    if (!container) return;
    if (!labels || labels.length === 0) {
        container.innerHTML = '<p style="color:#999;text-align:center;padding:20px;">No candidate data for today yet.</p>';
        return;
    }
    container.innerHTML = `<canvas id="candidatesPieChart" width="220" height="140"></canvas>`;
    const ctx = document.getElementById('candidatesPieChart').getContext('2d');
    if (window.candidatesPieChart) window.candidatesPieChart.destroy();
    window.candidatesPieChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: colors,
                borderWidth: 1
            }]
        },
        options: {
            responsive: false,
            plugins: {
                legend: { position: 'bottom' },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed;
                            return `${label}: ${value} candidate${value === 1 ? '' : 's'}`;
                        }
                    }
                }
            }
        }
    });
}

// ==================== INITIALIZATION ====================
    // Also render the pie chart below the action buttons in the main UI (date-aware)
    (function loadMainPagePieChart() {
        const now = new Date();
        const pad = n => n.toString().padStart(2, '0');
        const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        apiCall('GET', `/api/pie-chart-data?date=${todayStr}`)
            .then(data => {
                const counts = data.counts || {};
                const labels = Object.keys(counts).sort((a, b) => {
                    const [an] = a.split('/').map(Number);
                    const [bn] = b.split('/').map(Number);
                    return bn - an;
                });
                const values = labels.map(l => counts[l]);
                const colors = labels.map(l => {
                    const [n, t] = l.split('/').map(Number);
                    if (n === t) return '#4CAF50';
                    if (n === 0) return '#F44336';
                    return '#FFC107';
                });
                renderCandidatesPieChart(labels, values, colors);
            })
            .catch(() => {
                renderCandidatesPieChart([], [], []);
            });
    })();
async function init() {
    try {
        console.log('Initializing app, loading config...');
        const response = await apiCall('GET', '/api/config');
        maxExperienceYears = response.maxExperienceYears;
        experienceTiers = response.experienceTiers;

        // Populate CONFIG from server (all values come from data/config.js)
        CONFIG.copyPasteEnabled    = response.copyPasteEnabled;
        CONFIG.nextButtonEnabled   = response.nextButtonEnabled;
        CONFIG.questionTimeLimits  = response.questionTimeLimits;
        CONFIG.defaultTimeLimit    = response.defaultTimeLimit;
        CONFIG.timerWarningAt      = response.timerWarningAt;
        CONFIG.timerCountdownAt    = response.timerCountdownAt;
        CONFIG.tabSwitchFreezeLimit= response.tabSwitchFreezeLimit;
        CONFIG.autoSaveIntervalMs  = response.autoSaveIntervalMs;
        CONFIG.instructionReadTimer= response.instructionReadTimer;
        CONFIG.primaryAgent        = response.primaryAgent || 'Rule Engine';
        CONFIG.primaryAgent        = response.primaryAgent || 'ENHANCED-RULE-ENGINE';
    CONFIG.primaryAgent        = response.primaryAgent || 'enhanced-rule-engine';
    CONFIG.primaryAgent        = response.primaryAgent || 'Rule Engine';

        console.log('Config loaded successfully:', { maxExperienceYears, experienceTiers, CONFIG });
    } catch (err) {
        console.error('Failed to load config:', err);
        showToast('Warning: Could not load configuration. Some features may not work correctly.', 'warning');
    }

    // Always require email login first — resume is offered after OTP verification
    showStep(0);
}

// Spec Section 9: Language Templates
function getTemplateForLanguage(language, question) {
    if (language === 'java') {
        return buildJavaStarterTemplate();
    } else if (language === 'python') {
        return buildPythonStarterTemplate();
    } else if (language === 'javascript') {
        return buildJavaScriptStarterTemplate();
    }
    return '// Write your code here\n';
}

function buildJavaStarterTemplate() {
    return `import java.util.*;

public class Solution {
    public static void main(String[] args) {
        // TODO: Write your solution here
    }
}`;
}

function buildPythonStarterTemplate() {
    return `# Write your solution here`;
}

function buildJavaScriptStarterTemplate() {
    return `// Write your solution here
`;
}

// ==================== DRAGGABLE TIMER ====================
function resetTimerPosition() {
    const timer = document.getElementById('totalTimer');
    if (!timer) return;
    timer.style.right = '20px';
    timer.style.top = '15px';
    timer.style.left = 'auto';
}

function initDraggableTimer() {
    const timer = document.getElementById('totalTimer');
    const handle = document.getElementById('totalTimerDragHandle');
    if (!timer || !handle) return;
    
    // Remove old listeners to avoid duplicates
    if (timer._dragCleanup) timer._dragCleanup();
    
    let isDragging = false;
    let offsetX, offsetY;
    
    function onMouseDown(e) {
        isDragging = true;
        offsetX = e.clientX - timer.getBoundingClientRect().left;
        offsetY = e.clientY - timer.getBoundingClientRect().top;
        timer.style.right = 'auto';
        e.preventDefault();
    }
    function onMouseMove(e) {
        if (!isDragging) return;
        let x = e.clientX - offsetX;
        let y = e.clientY - offsetY;
        x = Math.max(0, Math.min(x, window.innerWidth - timer.offsetWidth));
        y = Math.max(0, Math.min(y, window.innerHeight - timer.offsetHeight));
        timer.style.left = x + 'px';
        timer.style.top = y + 'px';
    }
    function onMouseUp() {
        isDragging = false;
    }
    
    handle.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    
    timer._dragCleanup = () => {
        handle.removeEventListener('mousedown', onMouseDown);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    };
}

window.addEventListener('beforeunload', (e) => {
    if (!assessmentSubmitted && currentQuestionIndex < totalPrograms && totalPrograms > 0) {
        // Save current state so candidate can resume
        saveCurrentCode();
        saveCurrentOutputState();
        saveSession();
        e.returnValue = 'Your assessment progress will be saved. You can resume when you return.';
    }
});

// Admin/Panelist whitelist — loaded dynamically from /api/config (data/config.js)
let PANELIST_EMAILS = [];

async function loadPanelistEmails() {
    if (PANELIST_EMAILS.length > 0) return; // already loaded
    try {
        const cfg = await apiCall('GET', '/api/config');
        PANELIST_EMAILS = (cfg.panelistEmails || []).map(e => e.trim().toLowerCase());
    } catch (err) {
        console.error('Failed to load panelist emails:', err);
    }
}

function isPanelistEmail(email) {
    return PANELIST_EMAILS.includes((email || '').trim().toLowerCase());
}

// Role Selection Functions
function goToCandidateDashboard() {
    document.getElementById('roleSelectionModal').classList.add('hidden');
    showStep(2);
}

function goToPanelistDashboard() {
    window.location.href = '/public/panelist.html';
}

function logoutRole() {
    localStorage.removeItem('candidateId');
    localStorage.removeItem('sessionId');
    localStorage.removeItem('candidateName');
    localStorage.removeItem('testStartTime');
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('authEmail');
    document.getElementById('roleSelectionModal').classList.add('hidden');
    document.getElementById('emailForm').style.display = 'block';
    document.getElementById('otpForm').style.display = 'none';
    document.getElementById('emailInput').value = '';
    document.getElementById('otpInput').value = '';
    document.getElementById('loginStatus').textContent = '';
    showStep(0);
}

// Suppress known browser extension errors
window.addEventListener('error', (event) => {
    if (event.message && event.message.includes('message channel closed')) {
        event.preventDefault();
        return true;
    }
});

// Suppress unhandled promise rejections for known browser extension errors
window.addEventListener('unhandledrejection', (event) => {
    if (event.reason && event.reason.message && event.reason.message.includes('message channel closed')) {
        event.preventDefault();
        return true;
    }
});

init();
