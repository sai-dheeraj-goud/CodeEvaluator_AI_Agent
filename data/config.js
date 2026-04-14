// ====================================================================
// CENTRALIZED CONFIGURATION — All assessment settings in one place
// ====================================================================
// Edit the values below to customize the assessment.
// Both the server (src/server.js) and the frontend (public/app.js)
// read from this single file (data/config.js) — no need to hunt through multiple files.
// ====================================================================

module.exports = {
    // ================================================================
    //  PANELIST / ADMIN ACCESS CONTROL
    // ================================================================
    // Only these email addresses can see the Panel button and access
    // the Panelist Dashboard. All other users go straight to the
    // Candidate test. Add or remove emails here as needed.
    panelistEmails: [
        'dheeraj.sai171998@gmail.com',
        'dheeraj.sai17@gmail.com'
    ],
    // ================================================================
    //  SERVER-SIDE SETTINGS (used by src/server.js)
    // ================================================================

    // 1. Maximum allowed experience in years (validation cap)
    maxExperienceYears: 20,

    // 2. Experience Tiers — defines how many questions per difficulty level
    //    maxYears  → candidates with experience ≤ this value fall into this tier
    //    questions → how many questions of each difficulty to assign
    //    Per-question timers are controlled by questionTimeLimits below.
    //    Total session time is AUTO-CALCULATED from per-question timers.
    experienceTiers: [
        { maxYears: 4,  questions: { moderate: 1 }             },
        { maxYears: 6,  questions: { moderate: 2 }             },
        { maxYears: 20, questions: { moderate: 1, complex: 1 } }
    ],

    // 3. Path to the questions JSON file (relative to src/ directory)
    questionsFileRel: '../data/questions.json',

    // 4. Server port (can also be set via PORT environment variable)
    port: 3000,

    // ================================================================
    //  FRONTEND SETTINGS (served to public/app.js via /api/config)
    // ================================================================

    // --- Copy-Paste Control ---
    // true  → copy/paste/cut/right-click work normally
    // false → copy/paste/cut/right-click are blocked (anti-cheat mode)
    copyPasteEnabled: true,

    // --- Next Button Control ---
    // true  → Next button is enabled immediately (candidates can skip ahead)
    // false → Next button is disabled until the question timer expires
    nextButtonEnabled: true,

    // --- Per-Question Time Limits (in seconds) ---
    // These control how much time each question gets, based on difficulty.
    // Change these values to adjust the per-question countdown timer.
    questionTimeLimits: {
        moderate: 10 * 60,   // 10 minutes  (600 seconds)
        complex:  15 * 60    // 15 minutes  (900 seconds)
    },

    // --- Default Fallback Time Limit (in seconds) ---
    defaultTimeLimit: 10 * 60,  // 10 minutes (used if question difficulty is unknown)

    // --- Timer Warning Popups (in seconds remaining) ---
    timerWarningAt: 60,        // "Last 1 minute remaining!" popup
    timerCountdownAt: 10,      // Countdown popup starts

    // --- Tab Switch Freeze ---
    // Lock and auto-submit assessment after this many tab switches
    tabSwitchFreezeLimit: 5,

    // --- Auto-Save Interval (in milliseconds) ---
    autoSaveIntervalMs: 30000, // 30 seconds

    // --- Instruction Read Timer (in seconds) ---
    // Consent checkbox stays disabled for this duration on the Instructions page.
    // Change this value to give candidates more/less reading time.
    instructionReadTimer: 30   // 30 seconds
};
