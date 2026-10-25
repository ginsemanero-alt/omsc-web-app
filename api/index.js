import 'dotenv/config';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import cors from 'cors';
import bcrypt from 'bcryptjs'; // ← bcryptjs, hindi bcrypt (mas stable sa Vercel serverless)
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Resend } from 'resend';
import crypto from 'crypto';


const app = express();

// Deployed on Vercel behind its edge proxy, so the real client IP arrives
// in X-Forwarded-For, not the socket address — without this, every
// request looks like it comes from Vercel's proxy and express-rate-limit
// would lump every visitor into one shared bucket instead of limiting
// per-client. `1` trusts exactly one hop (Vercel's own proxy), not an
// arbitrary chain an attacker could spoof.
app.set('trust proxy', 1);

// --- CORS ALLOWLIST ---
// ALLOWED_ORIGINS is a comma-separated list of origins allowed to call this
// API (e.g. "https://your-app.vercel.app,http://localhost:5173").
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        // Allow same-origin/non-browser requests (no Origin header) and any
        // origin present in the allowlist.
        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '1mb' }));

// --- RATE LIMITING ---
// In-memory counters — fine for this app's traffic, but a caveat worth
// knowing: Vercel serverless functions can scale to multiple concurrent
// instances, each with its own counter, so a sufficiently distributed
// attacker could see somewhat more than these numbers before every path
// converges on being blocked. Still a large improvement over the zero
// limiting this had before; move to a shared store (e.g. Upstash Redis)
// if this app's traffic ever grows enough to make that gap matter.
const rateLimitHandler = (req, res) => {
    res.status(429).json({ message: "Too many requests. Please try again later." });
};

// Login is the main brute-force target — keyed per IP+email so one
// attacker guessing many passwords against one account is capped, without
// a shared office/campus IP locking every student out of their own account.
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    // ipKeyGenerator (not raw req.ip) correctly collapses an IPv6 address
    // to its /56 subnet first — otherwise an attacker on IPv6 could rotate
    // addresses within their own prefix to dodge the per-IP+email bucket.
    keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${(req.body?.email || '').trim().toLowerCase()}`,
    handler: rateLimitHandler,
});

// Registration spam / mass fake-account creation. Two limiters, both must
// pass. A flat per-IP cap of 5/hour locked out whole campuses: students on
// campus Wi-Fi (NAT) share one public IP, so a class registering together
// hit it after five people.
//   1. Per IP + email, 5/hour: one person retrying, or a script hammering
//      one address, is capped.
//   2. Per IP, 60/hour: a loose ceiling on mass account creation from one
//      address, high enough for a shared campus IP.
// Like every limiter here these are in-memory (see the note above).
const registerEmailLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${(req.body?.email || '').trim().toLowerCase()}`,
    handler: rateLimitHandler,
});

const registerIpLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
});

// Already gated by requiring a valid admin session token, but rate
// limiting it too costs nothing and blunts a compromised admin token
// being used to mass-create accounts.
const createStaffLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
});

// Same reasoning as createStaffLimiter — admin-session-gated already, this
// just blunts a compromised admin token from mass-deleting accounts.
const deleteUserLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
});

// Admin-session-gated, but a compromised admin token spamming this could
// still mass-email every student repeatedly — cap it well below anything
// a legitimate publishing workflow would ever hit.
const notifyLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
});

// OpenRouter's free tier is 50 requests/day account-wide, and a failed
// attempt still counts against it — capped well below that so a burst of
// admin clicks (or retries during testing) can't exhaust the day's quota
// before a real thesis-defense session needs it. Cache hits (the common
// case once numbers stop changing) never reach this limiter's protected
// work at all, since they're served before any OpenRouter call is made.
const analyticsInsightLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000,
    limit: 40,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
});

// Light blanket cap on every /api/* route as a general safety net against
// scripted abuse/scraping, on top of the stricter limiters above.
const globalApiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    // High enough for a whole class behind one campus Wi-Fi IP (NAT).
    limit: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
});
app.use('/api/', globalApiLimiter);

// --- SUPABASE CONFIG ---
// Walang dotenv — Vercel env vars ay available na via process.env
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
    console.error("❌ Missing Supabase environment variables!");
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey);

// --- RESEND CONFIG (student email notifications) ---
// Optional by design — set up after the rest of this feature was already
// built, so its absence must never break Program/Survey publishing itself.
// `resend` stays null until RESEND_API_KEY is set; every call site below
// checks for that and just skips sending (with a console.warn) instead of
// throwing. `onboarding@resend.dev` is Resend's own sandbox sender, which
// works immediately with no domain verification — fine for getting this
// running, but swap in a verified domain (RESEND_FROM_EMAIL) before this
// is relied on for real.
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const RESEND_FROM = process.env.RESEND_FROM_EMAIL || 'OMSU Guidance <onboarding@resend.dev>';
if (!resend) {
    console.warn('⚠️  RESEND_API_KEY not set — student email notifications are disabled until it is configured.');
}

// --- OPENROUTER CONFIG (Analytics AI Insight) ---
// Server-side only, on purpose — this key must never reach the browser.
// Pinned exact free-model ids, not a generic "auto" pick: OpenRouter's free
// tier is 50 requests/day account-wide and a model silently swapping out
// from under us would make the "matches what I approved" guarantee (and any
// results consistency during a live thesis defense) impossible to reason
// about. Primary is tried once; on any failure, the fallback is tried
// exactly once — no loops, since failed attempts still burn the daily quota.
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
// google/gemma-4-31b-it:free and qwen/qwen3.8-27b:free were both hitting
// the same congested upstream shared free pool at the same time — swapped
// primary to nvidia's slug (different upstream provider), confirmed
// responding correctly, with the old primary kept on as fallback.
const OPENROUTER_PRIMARY_MODEL = 'nvidia/nemotron-3-super-120b-a12b:free';
const OPENROUTER_FALLBACK_MODEL = 'google/gemma-4-31b-it:free';
if (!OPENROUTER_API_KEY) {
    console.warn('⚠️  OPENROUTER_API_KEY not set — the Analytics AI Insight feature is disabled until it is configured.');
}

// Deterministic hash of the aggregated numbers an insight was generated
// from — object key order isn't guaranteed stable across requests, so keys
// are sorted recursively before hashing; otherwise the same underlying
// data could hash differently and defeat the cache for no reason.
function canonicalStringify(value) {
    if (Array.isArray(value)) {
        return `[${value.map(canonicalStringify).join(',')}]`;
    }
    if (value && typeof value === 'object') {
        const keys = Object.keys(value).sort();
        return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(value[k])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function hashMetrics(metrics) {
    return crypto.createHash('sha256').update(canonicalStringify(metrics)).digest('hex');
}

// Defense in depth: the frontend is only ever supposed to send aggregate
// figures, but this asserts it server-side before anything is forwarded to
// a third party. Rejects outright rather than trying to strip/redact —
// a payload that shouldn't contain this in the first place is a bug to
// surface, not paper over.
//
// Deliberately NOT blocking a bare "name" or "label" key — those are the
// standard chart-data convention this codebase already uses for category/
// type labels (e.g. materialTypeAnalytics: [{ name: "PDF", count: 5 }]),
// and blocking them flags every legitimate aggregate as a false positive.
// Only compound, unambiguously person-identifying key names are blocked.
const PII_KEY_BLOCKLIST = new Set([
    'email', 'actor_email', 'actor_name', 'full_name', 'fullname',
    'student_id', 'studentid', 'user_id', 'userid', 'contact_no',
    'contactno', 'phone', 'address', 'password',
]);
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

function findPII(value, path = 'metrics') {
    if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i += 1) {
            const found = findPII(value[i], `${path}[${i}]`);
            if (found) return found;
        }
        return null;
    }
    if (value && typeof value === 'object') {
        for (const key of Object.keys(value)) {
            if (PII_KEY_BLOCKLIST.has(key.toLowerCase())) {
                return `${path}.${key}`;
            }
            const found = findPII(value[key], `${path}.${key}`);
            if (found) return found;
        }
        return null;
    }
    if (typeof value === 'string' && (EMAIL_PATTERN.test(value) || UUID_PATTERN.test(value))) {
        return path;
    }
    return null;
}

async function callOpenRouter(model, metrics, sectionLabel) {
    const systemPrompt = [
        'You are explaining guidance-office analytics data to a school guidance counselor who is not a developer or data analyst.',
        'Summarize it as a short, concise bulleted list of the most important findings — not flowing paragraphs.',
        'Write between 4 and 8 bullet points. Each bullet is one short, plain-language sentence — get straight to the point, no filler, no restating the section title.',
        'Only ever refer to numbers that literally appear in the JSON data you are given. Never invent, estimate, or round a number that is not present in that data.',
        'If a figure is missing or zero, say so plainly in its own bullet instead of guessing.',
        'If learningGain data is present, state whether scores improved from pre-test to post-test and whether the paired t-test is significant (p below 0.05), and flag any result marked smallSample or interpretWithCaution as based on few students.',
        'Start every bullet on its own line with a dash and a space, like "- your point here". Do not use any other markdown — no asterisks for bold or italics, no # headers, no numbered lists, no backticks.',
    ].join(' ');

    const userPrompt = `Section: ${sectionLabel}\n\nAggregated data (JSON):\n${JSON.stringify(metrics, null, 2)}\n\nSummarize what this data means for the guidance office.`;

    // A hung provider (no response, ever) is worse than a fast error — it
    // would stall this request indefinitely instead of moving on to the
    // fallback model within a reasonable time. 20s is generous for a
    // single free-model completion but still fails fast enough that the
    // primary+fallback path resolves well under a typical page-load
    // patience budget.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    let response;
    try {
        response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
            }),
            signal: controller.signal,
        });
    } catch (err) {
        if (err.name === 'AbortError') {
            throw new Error(`OpenRouter (${model}) timed out after 20s`);
        }
        throw err;
    } finally {
        clearTimeout(timeout);
    }

    if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(`OpenRouter (${model}) returned ${response.status}: ${errorBody.slice(0, 300)}`);
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) {
        throw new Error(`OpenRouter (${model}) returned no explanation text`);
    }

    return stripMarkdown(text);
}

// Free models don't reliably follow the system prompt's formatting
// instructions on their own — this is the safety net. Bold/italic/header/
// backtick markers never reach the admin's screen as literal asterisks or
// hashes even when a model ignores the prompt. Dash/asterisk bullet
// markers are normalized to "• " rather than stripped bare, since the
// prompt now asks for a bulleted list and the frontend renders lines
// starting with "• " as an actual <ul> — stripping them here would flatten
// the list back into indistinguishable run-on lines. Numbered-list markers
// are still stripped bare since the prompt explicitly asks for dashes,
// not numbers.
function stripMarkdown(text) {
    return text
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/(?<!\*)\*(?!\*)(.+?)\*(?!\*)/g, '$1')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/^\s*[-*+]\s+/gm, '• ')
        .replace(/^\s*\d+\.\s+/gm, '')
        .replace(/`([^`]+)`/g, '$1');
}

// Sends a student's 6-digit email verification code through Supabase
// Auth's own "Confirm signup" email (custom SMTP: Resend). Works for an
// account created unconfirmed with auth.admin.createUser. Best-effort:
// returns false instead of throwing (e.g. the 60-second resend limit), so
// the student lands on the code screen and can tap "Resend code".
async function sendSignupCode(email) {
    const { error } = await supabaseAnon.auth.resend({ type: 'signup', email });
    if (error) {
        console.warn('Verification code not sent:', error.message);
        return false;
    }
    return true;
}

// Sign-in failed only because the email isn't verified yet.
function isEmailNotConfirmed(error) {
    return error?.code === 'email_not_confirmed' || /email not confirmed/i.test(error?.message || '');
}

// --- ROUTES ---

app.get('/api/health', (req, res) => {
    res.status(200).json({ status: "OK", message: "Backend is running" });
});

// The version of the Data Privacy Notice (src/lib/privacyNotice.ts,
// PRIVACY_NOTICE_VERSION) that registration must agree to. Keep the two in
// step: bumping one without the other blocks registration.
const CURRENT_CONSENT_VERSION = '2026-10';

app.post('/api/register', registerIpLimiter, registerEmailLimiter, async (req, res) => {
    const {
        studentId, name, email, password, campus,
        program, yearLevel, status, age, gender, isIp, isPwd, consentVersion
    } = req.body;

    // Nothing is collected until the student has agreed to the current
    // Data Privacy Notice (RA 10173). Checked first, before any lookup or
    // account creation.
    if (consentVersion !== CURRENT_CONSENT_VERSION) {
        return res.status(400).json({
            message: "Please read and agree to the Data Privacy Notice before registering."
        });
    }

    const cleanEmail = email?.trim().toLowerCase();
    const cleanStudentId = studentId?.trim();
    const cleanName = name?.trim();
    // Public self-registration only ever creates student accounts. The
    // request body used to be trusted for `role`, which meant anyone could
    // POST role: "admin" with no authentication and get a fully-privileged
    // account — confirmed exploitable, fixed here. Admin accounts are
    // provisioned separately (directly in Supabase), not through this
    // public endpoint.
    const finalRole = 'student';

    // The registration form requires an explicit answer for gender, PWD,
    // and IP (no default, no "Prefer not to say") because they feed the
    // demographic analytics. Enforced here too, not just in the form.
    // profiles.is_ip / is_pwd are booleans: "Yes" -> true, "No" -> false.
    const toBool = (value) => value === 'Yes';

    if (!['Male', 'Female', 'Other'].includes(gender)) {
        return res.status(400).json({ message: "Please select your gender." });
    }
    if (!['Yes', 'No'].includes(isPwd) || !['Yes', 'No'].includes(isIp)) {
        return res.status(400).json({ message: "Please answer the PWD and IP status questions." });
    }

    try {
        const { data: existing } = await supabase
            .from('users')
            .select('email')
            .or(`email.eq.${cleanEmail},student_id.eq.${cleanStudentId}`);

        if (existing && existing.length > 0) {
            return res.status(400).json({ message: "Email or Student ID already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Create the Supabase Auth user first so we have its uuid, which is
        // what `profiles.id` is keyed on (profiles.id = auth.users.id).
        // `users.id` is an unrelated bigint auto-increment id, so demographics
        // can only be linked to the real auth identity via this uuid, not
        // via users.id.
        //
        // Created unconfirmed: the student proves they own the email with
        // the 6-digit code sent below before they can sign in (Supabase
        // "Confirm email" on). Every other account path (staff, seed
        // script, the legacy fallback in /api/login) stays confirmed.
        const { data: authCreate, error: authCreateError } = await supabase.auth.admin.createUser({
            email: cleanEmail,
            password: password,
            email_confirm: false,
            user_metadata: { name: cleanName, role: finalRole }
        });

        if (authCreateError) throw authCreateError;

        const authUserId = authCreate.user.id;

        // `users` holds account/access-control fields only. Demographics
        // live in `profiles`, which is the single source analytics reads.
        const { data, error: dbError } = await supabase
            .from('users')
            .insert([{
                student_id: cleanStudentId,
                name: cleanName,
                email: cleanEmail,
                password: hashedPassword,
                role: finalRole,
                campus,
                status: status || 'active',
                // The timestamp is the server's, never the client's.
                consent_given_at: new Date().toISOString(),
                consent_version: CURRENT_CONSENT_VERSION
            }])
            .select();

        if (dbError) {
            await supabase.auth.admin.deleteUser(authUserId);
            throw dbError;
        }

        // Append-only history of the agreement (consent_log, PHASE 33).
        const { error: consentLogError } = await supabase
            .from('consent_log')
            .insert([{ user_id: data[0].id, consent_version: CURRENT_CONSENT_VERSION }]);

        if (consentLogError) {
            await supabase.from('users').delete().eq('id', data[0].id);
            await supabase.auth.admin.deleteUser(authUserId);
            throw consentLogError;
        }

        const { error: profileError } = await supabase
            .from('profiles')
            .insert([{
                id: authUserId,
                full_name: cleanName,
                student_id: cleanStudentId,
                campus,
                program,
                year_level: yearLevel,
                age,
                gender,
                is_ip: toBool(isIp),
                is_pwd: toBool(isPwd),
                user_role: finalRole
            }]);

        if (profileError) {
            await supabase.from('users').delete().eq('id', data[0].id);
            await supabase.auth.admin.deleteUser(authUserId);
            throw profileError;
        }

        // Fire-and-forget, same as the client-side logActivity() helper —
        // a logging failure must never fail a successful registration.
        // Uses the service-role client already in scope here, so unlike
        // logActivity() (called from the browser under RLS) this doesn't
        // need the student to have an active session yet, which they
        // don't at this point — /api/register returns no auth tokens,
        // only /api/login does.
        try {
            await supabase.from('activity_logs').insert([{
                actor_email: cleanEmail,
                actor_name: cleanName,
                action: 'create',
                entity_type: 'user',
                entity_id: String(data[0].id),
                entity_label: cleanName,
                details: 'Student self-registration',
            }]);
        } catch (logErr) {
            console.warn('Activity log write failed (register):', logErr.message);
        }

        const codeSent = await sendSignupCode(cleanEmail);

        res.status(201).json({
            message: "Account created!",
            userId: data[0].id,
            email: cleanEmail,
            verificationRequired: true,
            codeSent,
        });
    } catch (error) {
        console.error("Registration Error:", error.message);
        res.status(500).json({ message: error.message });
    }
});

app.post('/api/admin/create-staff', createStaffLimiter, async (req, res) => {
    // Same privilege-escalation risk /api/register used to have if left
    // unchecked, so this endpoint requires the caller's own session token
    // and verifies they're an active admin before creating anything.
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
        return res.status(401).json({ message: "Missing authorization token" });
    }

    try {
        const { data: { user: callerAuthUser }, error: callerError } = await supabase.auth.getUser(token);

        if (callerError || !callerAuthUser?.email) {
            return res.status(401).json({ message: "Invalid or expired session" });
        }

        const { data: callerRecord } = await supabase
            .from('users')
            .select('role')
            .eq('email', callerAuthUser.email.toLowerCase())
            .maybeSingle();

        if (callerRecord?.role !== 'admin') {
            return res.status(403).json({ message: "Only admins can create staff accounts" });
        }

        const { name, email, password, campus, isTestAccount } = req.body;
        const cleanEmail = email?.trim().toLowerCase();
        const cleanName = name?.trim();

        if (!cleanName || !cleanEmail || !password || password.length < 8) {
            return res.status(400).json({ message: "Name, email, and a password of at least 8 characters are required" });
        }

        const { data: existing } = await supabase
            .from('users')
            .select('email')
            .eq('email', cleanEmail);

        if (existing && existing.length > 0) {
            return res.status(400).json({ message: "Email already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Same auth-then-db creation order as /api/register, for the same
        // reason: profiles/users rows are meaningless without a matching
        // auth identity, so the auth user has to exist first.
        const { data: authCreate, error: authCreateError } = await supabase.auth.admin.createUser({
            email: cleanEmail,
            password,
            email_confirm: true,
            user_metadata: { name: cleanName, role: 'admin' }
        });

        if (authCreateError) throw authCreateError;

        const authUserId = authCreate.user.id;

        // Admin accounts have no `profiles` row — demographics are
        // student-only by design (see /api/register and TopNavBar).
        const { data, error: dbError } = await supabase
            .from('users')
            .insert([{
                name: cleanName,
                email: cleanEmail,
                password: hashedPassword,
                role: 'admin',
                campus: campus || null,
                status: 'active',
                // Test admins publish without notifying students
                // (see /api/notify-students).
                is_test_account: isTestAccount === true
            }])
            .select();

        if (dbError) {
            await supabase.auth.admin.deleteUser(authUserId);
            throw dbError;
        }

        res.status(201).json({ message: "Staff account created!", userId: data[0].id });
    } catch (error) {
        console.error("Create Staff Error:", error.message);
        res.status(500).json({ message: error.message });
    }
});

// The admin Users page used to delete straight from `users` via the
// browser's own Supabase client — that only ever removed that one row.
// The account's `profiles` row (keyed on the Auth uuid, not `users.id`)
// and its Auth identity were left behind, so a "deleted" student kept
// showing up in every demographics chart and, worse, could still log in.
// Deleting all three needs the service-role key, so it has to happen here.
app.post('/api/admin/delete-user', deleteUserLimiter, async (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
        return res.status(401).json({ message: "Missing authorization token" });
    }

    try {
        const { data: { user: callerAuthUser }, error: callerError } = await supabase.auth.getUser(token);

        if (callerError || !callerAuthUser?.email) {
            return res.status(401).json({ message: "Invalid or expired session" });
        }

        const { data: callerRecord } = await supabase
            .from('users')
            .select('role')
            .eq('email', callerAuthUser.email.toLowerCase())
            .maybeSingle();

        if (callerRecord?.role !== 'admin') {
            return res.status(403).json({ message: "Only admins can delete accounts" });
        }

        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({ message: "userId is required" });
        }

        const { data: targetUser, error: targetError } = await supabase
            .from('users')
            .select('id, name, email')
            .eq('id', userId)
            .maybeSingle();

        if (targetError) throw targetError;
        if (!targetUser) {
            return res.status(404).json({ message: "User not found" });
        }

        // profiles.id = the Auth uuid, which `users` never stores (see the
        // linking note in /api/register) — email is the one field both
        // `users` and Auth are guaranteed to agree on, so it's the bridge.
        let authUserId = null;
        if (targetUser.email) {
            let page = 1;
            const perPage = 200;
            while (!authUserId) {
                const { data: authPage, error: listError } = await supabase.auth.admin.listUsers({ page, perPage });
                if (listError) {
                    console.warn('delete-user: listUsers failed:', listError.message);
                    break;
                }
                const match = authPage.users.find(
                    (u) => u.email?.toLowerCase() === targetUser.email.toLowerCase()
                );
                if (match) {
                    authUserId = match.id;
                    break;
                }
                if (authPage.users.length < perPage) break;
                page += 1;
            }
        }

        if (authUserId) {
            const { error: profileDeleteError } = await supabase
                .from('profiles')
                .delete()
                .eq('id', authUserId);
            if (profileDeleteError) {
                console.warn('delete-user: profiles delete failed:', profileDeleteError.message);
            }
        }

        const { error: userDeleteError } = await supabase
            .from('users')
            .delete()
            .eq('id', userId);
        if (userDeleteError) throw userDeleteError;

        if (authUserId) {
            const { error: authDeleteError } = await supabase.auth.admin.deleteUser(authUserId);
            if (authDeleteError) {
                console.warn('delete-user: auth delete failed:', authDeleteError.message);
            }
        }

        try {
            await supabase.from('activity_logs').insert([{
                actor_email: callerAuthUser.email,
                actor_name: callerRecord?.name || callerAuthUser.email,
                action: 'delete',
                entity_type: 'user',
                entity_id: String(userId),
                entity_label: targetUser.name || targetUser.email,
            }]);
        } catch (logErr) {
            console.warn('Activity log write failed (delete-user):', logErr.message);
        }

        res.status(200).json({ message: "Account deleted." });
    } catch (error) {
        console.error("Delete User Error:", error.message);
        res.status(500).json({ message: error.message });
    }
});

app.post('/api/login', loginLimiter, async (req, res) => {
    const { email, password } = req.body;
    const cleanEmail = email?.trim().toLowerCase();

    try {
        // Archived accounts are treated as if they don't exist — same
        // as useAuth.tsx's own session check, so an archived user can't
        // log in through either path.
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', cleanEmail)
            .is('archived_at', null)
            .maybeSingle();

        if (!user) return res.status(404).json({ message: "User not found" });

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            // `users.password` (this bcrypt hash) and the Supabase Auth
            // password are two separate stores that only ever get kept in
            // sync by this login flow itself — the Forgot Password page
            // only ever updates Auth. Right after a reset they drift: the
            // new password is correct in Auth but this hash is still the
            // old one, so a flat reject here would permanently lock the
            // account out even with the right password. If Auth accepts
            // it, trust that and repair the stale hash instead.
            const { data: recovery, error: recoveryError } = await supabaseAnon.auth.signInWithPassword({
                email: cleanEmail,
                password: password,
            });

            if (!recovery?.session) {
                if (isEmailNotConfirmed(recoveryError)) {
                    const codeSent = await sendSignupCode(cleanEmail);
                    return res.status(403).json({
                        code: 'email_not_confirmed',
                        email: cleanEmail,
                        codeSent,
                        message: 'Please verify your email to finish signing in.',
                    });
                }
                return res.status(401).json({ message: "Invalid credentials" });
            }

            const freshHash = await bcrypt.hash(password, 10);
            await supabase.from('users').update({ password: freshHash }).eq('id', user.id);

            return res.json({
                id: user.id,
                role: user.role,
                name: user.name,
                email: user.email,
                campus: user.campus,
                access_token: recovery.session.access_token,
                refresh_token: recovery.session.refresh_token,
            });
        }

        let { data: authData, error: authError } = await supabaseAnon.auth.signInWithPassword({
            email: cleanEmail,
            password: password,
        });

        // Registered but never entered the code: send a fresh one and let
        // the page show the "Enter the code" step.
        if (authError && isEmailNotConfirmed(authError)) {
            const codeSent = await sendSignupCode(cleanEmail);
            return res.status(403).json({
                code: 'email_not_confirmed',
                email: cleanEmail,
                codeSent,
                message: 'Please verify your email to finish signing in.',
            });
        }

        // Older accounts that exist only in `users` (no Supabase Auth
        // user yet) get one here, already confirmed.
        if (authError) {
            await supabase.auth.admin.createUser({
                email: cleanEmail,
                password: password,
                email_confirm: true,
                user_metadata: { name: user.name, role: user.role }
            });

            const retry = await supabaseAnon.auth.signInWithPassword({
                email: cleanEmail,
                password: password,
            });
            authData = retry.data;
        }

        res.json({
            id: user.id,
            role: user.role,
            name: user.name,
            email: user.email,
            campus: user.campus,
            access_token: authData?.session?.access_token || null,
            refresh_token: authData?.session?.refresh_token || null
        });
    } catch (err) {
        console.error("Login Error:", err.message);
        res.status(500).json({ message: "Internal server error" });
    }
});

// Notifies every active student when the admin publishes a new Program
// or activates a new Survey — both an in-app row (the primary channel;
// always attempted) and an email (best-effort, only if RESEND_API_KEY
// is configured). Same admin-session-check shape as
// /api/admin/create-staff — this fans out to potentially every student
// in the system, so it's gated the same way.
app.post('/api/notify-students', notifyLimiter, async (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
        return res.status(401).json({ message: "Missing authorization token" });
    }

    try {
        const { data: { user: callerAuthUser }, error: callerError } = await supabase.auth.getUser(token);

        if (callerError || !callerAuthUser?.email) {
            return res.status(401).json({ message: "Invalid or expired session" });
        }

        const { data: callerRecord } = await supabase
            .from('users')
            .select('role, is_test_account')
            .eq('email', callerAuthUser.email.toLowerCase())
            .maybeSingle();

        if (callerRecord?.role !== 'admin') {
            return res.status(403).json({ message: "Only admins can send student notifications" });
        }

        // A test admin account can publish programs/surveys (e.g. to try
        // things out or demo) without emailing or notifying any student.
        if (callerRecord.is_test_account) {
            return res.status(200).json({
                notified: 0,
                emailSent: 0,
                skipped: true,
                message: "Test account: student notifications are disabled."
            });
        }

        const { type, title, details, actionPath } = req.body;
        if (type !== 'program' && type !== 'survey') {
            return res.status(400).json({ message: "type must be 'program' or 'survey'" });
        }
        if (!title?.trim()) {
            return res.status(400).json({ message: "title is required" });
        }

        const { data: students, error: studentsError } = await supabase
            .from('users')
            .select('id, email')
            .eq('role', 'student')
            .eq('status', 'active');

        if (studentsError) throw studentsError;

        const activeStudents = students || [];
        if (activeStudents.length === 0) {
            return res.status(200).json({ notified: 0, emailSent: 0, message: "No active students to notify." });
        }

        const link = actionPath || (type === 'program' ? '/student/programs' : '/student/survey');
        const message = (details || '').trim() || `A new ${type === 'program' ? 'guidance program' : 'survey'} titled "${title}" has just been posted.`;

        // In-app notification — the primary channel, so this always runs
        // regardless of whether email is configured. A failure here is
        // logged but doesn't block the email attempt below.
        let notifiedCount = 0;
        const notificationRows = activeStudents.map((s) => ({
            user_id: s.id,
            type,
            title,
            message,
            action_path: link,
        }));
        const { error: notifyError, count } = await supabase
            .from('notifications')
            .insert(notificationRows, { count: 'exact' });
        if (notifyError) {
            console.error('In-app notification insert failed:', notifyError.message);
        } else {
            notifiedCount = count ?? notificationRows.length;
        }

        if (!resend) {
            console.warn('Skipped email notification — RESEND_API_KEY not configured.');
            return res.status(200).json({ notified: notifiedCount, emailSent: 0, emailSkipped: true, total: activeStudents.length });
        }

        const recipients = [...new Set(activeStudents.map((s) => s.email).filter(Boolean))];

        const siteUrl = (process.env.SITE_URL || 'https://www.webguidance.online').replace(/\/$/, '');
        const fullLink = `${siteUrl}${link}`;
        const subject = type === 'program'
            ? `New Guidance Program: ${title}`
            : `New Survey Available: ${title}`;
        const html = `
            <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; color: #1e293b;">
                <h2 style="color: #4f46e5; margin-bottom: 4px;">${subject}</h2>
                <p style="color: #475569; line-height: 1.6;">${message}</p>
                <p style="margin: 24px 0;">
                    <a href="${fullLink}" style="display:inline-block;background:#4f46e5;color:#ffffff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:bold;">
                        View on the Portal
                    </a>
                </p>
                <p style="color:#94a3b8;font-size:12px;">OMSU Guidance System — you're receiving this because you have an active student account.</p>
            </div>
        `;

        // Resend's batch endpoint tops out at 100 emails per call.
        const BATCH_SIZE = 100;
        let sentCount = 0;
        for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
            const chunk = recipients.slice(i, i + BATCH_SIZE);
            const { error: sendError } = await resend.batch.send(
                chunk.map((email) => ({
                    from: RESEND_FROM,
                    to: email,
                    subject,
                    html,
                }))
            );

            if (sendError) {
                console.error('Resend batch send error:', sendError);
            } else {
                sentCount += chunk.length;
            }
        }

        res.status(200).json({ notified: notifiedCount, emailSent: sentCount, total: activeStudents.length });
    } catch (error) {
        console.error("Notify Students Error:", error.message);
        res.status(500).json({ message: error.message });
    }
});

// AI-generated plain-language explanation of the admin's Analytics
// dashboard, via OpenRouter (see the OPENROUTER CONFIG block above for the
// pinned models and the reasoning behind them). Same admin-session-check
// shape as the other admin-gated endpoints. Caches by section + a hash of
// the numbers the insight was generated from, so a click on unchanged data
// is instant and needs no OpenRouter call at all — this must keep working
// even if OpenRouter itself is down, since it's relied on live during a
// thesis defense.
app.post('/api/analytics-insight', analyticsInsightLimiter, async (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
        return res.status(401).json({ message: "Missing authorization token" });
    }

    try {
        const { data: { user: callerAuthUser }, error: callerError } = await supabase.auth.getUser(token);

        if (callerError || !callerAuthUser?.email) {
            return res.status(401).json({ message: "Invalid or expired session" });
        }

        const { data: callerRecord } = await supabase
            .from('users')
            .select('role')
            .eq('email', callerAuthUser.email.toLowerCase())
            .maybeSingle();

        if (callerRecord?.role !== 'admin') {
            return res.status(403).json({ message: "Only admins can generate analytics insights" });
        }

        if (!OPENROUTER_API_KEY) {
            return res.status(503).json({ message: "AI Insight is not configured on this server yet." });
        }

        const { section, sectionLabel, metrics, regenerate } = req.body;

        if (!section?.trim() || !sectionLabel?.trim()) {
            return res.status(400).json({ message: "section and sectionLabel are required" });
        }
        if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) {
            return res.status(400).json({ message: "metrics must be an object of aggregate figures" });
        }

        const piiPath = findPII(metrics);
        if (piiPath) {
            // Logged, not detailed to the client — the exact path could
            // itself hint at the shape of whatever slipped through.
            console.error(`analytics-insight: rejected payload, possible PII at ${piiPath}`);
            return res.status(400).json({ message: "Payload rejected: only aggregate figures are allowed." });
        }

        const dataHash = hashMetrics(metrics);

        if (!regenerate) {
            const { data: cached } = await supabase
                .from('analytics_insights')
                .select('insight, data_hash, model_used, generated_at')
                .eq('section', section)
                .maybeSingle();

            if (cached && cached.data_hash === dataHash) {
                return res.status(200).json({
                    section,
                    insight: cached.insight,
                    generatedAt: cached.generated_at,
                    cached: true,
                    model: cached.model_used,
                });
            }
        }

        let insightText;
        let modelUsed;
        try {
            insightText = await callOpenRouter(OPENROUTER_PRIMARY_MODEL, metrics, sectionLabel);
            modelUsed = OPENROUTER_PRIMARY_MODEL;
        } catch (primaryError) {
            console.warn('analytics-insight: primary model failed:', primaryError.message);
            try {
                insightText = await callOpenRouter(OPENROUTER_FALLBACK_MODEL, metrics, sectionLabel);
                modelUsed = OPENROUTER_FALLBACK_MODEL;
            } catch (fallbackError) {
                console.error('analytics-insight: fallback model also failed:', fallbackError.message);
                return res.status(502).json({ message: "AI Insight is temporarily unavailable. Please try again later." });
            }
        }

        const generatedAt = new Date().toISOString();

        const { error: upsertError } = await supabase
            .from('analytics_insights')
            .upsert(
                { section, insight: insightText, data_hash: dataHash, model_used: modelUsed, generated_at: generatedAt },
                { onConflict: 'section' }
            );
        if (upsertError) {
            console.warn('analytics-insight: cache write failed:', upsertError.message);
        }

        res.status(200).json({
            section,
            insight: insightText,
            generatedAt,
            cached: false,
            model: modelUsed,
        });
    } catch (error) {
        console.error("Analytics Insight Error:", error.message);
        res.status(500).json({ message: error.message });
    }
});

// =====================================================================
// PHASE 37 — VIDEOS ON CLOUDINARY
// Images, PDFs and audio stay in the private Supabase bucket. An uploaded
// video lives in Cloudinary as an AUTHENTICATED asset: the file cannot be
// fetched without a signature that only this server can make, and it makes
// one only for a signed-in user.
//
//  * Credentials come from the environment only. They are never logged,
//    returned, or put in an error message.
//  * Everything here is confined to the omsu-iec/ prefix. Nothing outside it
//    is ever created, read or deleted.
//  * On the Free plan a signed link has NO expiry (expiring links are an
//    Advanced-plan feature). The mitigations are: links are only issued to
//    signed-in users, the endpoint is rate limited per user, and an admin
//    can rotate a video's public_id, which kills every link already given out.
// =====================================================================
const CLD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLD_KEY = process.env.CLOUDINARY_API_KEY;
const CLD_SECRET = process.env.CLOUDINARY_API_SECRET;
const CLD_PREFIX = 'omsu-iec/';
const CLD_MAX_BYTES = 100 * 1024 * 1024; // the Free plan's own video limit too
const CLD_FREE_CREDITS_WARN_PCT = 70;
// Students are given the ORIGINAL uploaded file (the admin compresses videos
// before uploading): no playback transcode, so no processing cost and the
// bandwidth per full view is simply the file size. The signed link therefore
// has no transformation, and its extension must be the original's container
// (a different extension would make Cloudinary convert the file).
// The only derived copy is one still frame, made once at upload (eager), used
// to build the card thumbnails; it is never shown to students as-is.
const CLD_POSTER_TX = 'so_1,c_limit,w_960,h_960,f_jpg';
const CLD_PUBLIC_ID_RE = /^omsu-iec\/[A-Za-z0-9_-]{8,64}$/;
const CLD_VIDEO_FORMAT_RE = /^(mp4|m4v|mov|webm|mkv|avi|3gp|ogv|flv|wmv|mpg|mpeg)$/;

const cldConfigured = () => Boolean(CLD_NAME && CLD_KEY && CLD_SECRET);

// Signed Upload-API parameters: sha1 of the sorted "k=v&k=v" string + secret.
const cldSignParams = (params) =>
    crypto
        .createHash('sha1')
        .update(
            Object.keys(params)
                .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
                .sort()
                .map((k) => `${k}=${params[k]}`)
                .join('&') + CLD_SECRET
        )
        .digest('hex');

// Signed delivery URL for an authenticated asset. The signature covers
// "[<transformation>/]<public_id>.<ext>" and the same string must be requested.
// An empty transformation means the original file.
const cldDeliveryUrl = (publicId, transformation, ext) => {
    const path = `${transformation ? `${transformation}/` : ''}${publicId}.${ext}`;
    const sig = crypto
        .createHash('sha1')
        .update(path + CLD_SECRET)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .slice(0, 8);
    return `https://res.cloudinary.com/${CLD_NAME}/video/authenticated/s--${sig}--/${path}`;
};

const cldBasic = () => 'Basic ' + Buffer.from(`${CLD_KEY}:${CLD_SECRET}`).toString('base64');

// Admin API (Basic auth). Returns { status, body }.
async function cldAdmin(path, init = {}) {
    const response = await fetch(`https://api.cloudinary.com/v1_1/${CLD_NAME}${path}`, {
        ...init,
        headers: { Authorization: cldBasic(), ...(init.headers || {}) },
    });
    const body = await response.json().catch(() => ({}));
    return { status: response.status, body };
}

// Upload API call signed in the body (rename / explicit).
async function cldSignedUpload(path, params) {
    const timestamp = Math.floor(Date.now() / 1000);
    const signed = { ...params, timestamp };
    const form = new URLSearchParams();
    for (const [k, v] of Object.entries(signed)) form.append(k, String(v));
    form.append('api_key', CLD_KEY);
    form.append('signature', cldSignParams(signed));
    const response = await fetch(`https://api.cloudinary.com/v1_1/${CLD_NAME}${path}`, { method: 'POST', body: form });
    const body = await response.json().catch(() => ({}));
    return { status: response.status, body };
}

// Deletes an asset and every derived copy, and purges the CDN. Refuses
// anything outside omsu-iec/. A missing asset counts as already deleted.
async function cldDestroy(publicId) {
    if (!CLD_PUBLIC_ID_RE.test(publicId || '')) throw new Error('Refusing to delete outside the video folder.');
    const { status, body } = await cldAdmin(
        `/resources/video/authenticated?public_ids[]=${encodeURIComponent(publicId)}&invalidate=true`,
        { method: 'DELETE' }
    );
    if (status !== 200) throw new Error(`Video storage refused the delete (HTTP ${status}).`);
    const result = body?.deleted?.[publicId];
    if (result && result !== 'deleted' && result !== 'not_found') throw new Error('Video storage could not delete the file.');
}

// Bearer token -> { authUser, record } or sends the error response itself.
async function requireSignedIn(req, res, { admin = false } = {}) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
        res.status(401).json({ message: 'Missing authorization token' });
        return null;
    }
    const { data: { user: authUser }, error } = await supabase.auth.getUser(token);
    if (error || !authUser?.email) {
        res.status(401).json({ message: 'Invalid or expired session' });
        return null;
    }
    const { data: record } = await supabase
        .from('users')
        .select('role, archived_at')
        .eq('email', authUser.email.toLowerCase())
        .maybeSingle();
    if (!record || record.archived_at) {
        res.status(403).json({ message: 'This account cannot use this feature.' });
        return null;
    }
    if (admin && record.role !== 'admin') {
        res.status(403).json({ message: 'Only admins can do this.' });
        return null;
    }
    return { authUser, record, token };
}

const videoAdminLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
});

// Every play costs bandwidth credits, so signed links are limited PER USER
// (not per IP: a whole class shares one campus IP). The player keeps the link
// it was given for the life of the page, so a normal student asks a handful
// of times an hour at most. In-memory per instance, like the other limiters.
const VIDEO_URL_LIMIT = 60;
const VIDEO_URL_WINDOW_MS = 60 * 60 * 1000;
const videoUrlHits = new Map();
const videoUrlAllowed = (userId) => {
    const now = Date.now();
    const recent = (videoUrlHits.get(userId) || []).filter((t) => now - t < VIDEO_URL_WINDOW_MS);
    if (recent.length >= VIDEO_URL_LIMIT) {
        videoUrlHits.set(userId, recent);
        return false;
    }
    recent.push(now);
    videoUrlHits.set(userId, recent);
    if (videoUrlHits.size > 5000) {
        for (const [key, times] of videoUrlHits) if (!times.some((t) => now - t < VIDEO_URL_WINDOW_MS)) videoUrlHits.delete(key);
    }
    return true;
};

const cldGuard = (res) => {
    if (cldConfigured()) return true;
    res.status(503).json({ message: 'Video hosting is not configured on this server yet.' });
    return false;
};

// 1) Admin asks for permission to upload one video. The browser then sends
//    the file straight to Cloudinary with the signature returned here.
app.post('/api/admin/video-upload-signature', videoAdminLimiter, async (req, res) => {
    try {
        if (!cldGuard(res)) return;
        if (!(await requireSignedIn(req, res, { admin: true }))) return;

        const size = Number(req.body?.size);
        const type = String(req.body?.type || '');
        if (!type.startsWith('video/')) return res.status(400).json({ message: 'Please choose a video file.' });
        if (!Number.isFinite(size) || size <= 0) return res.status(400).json({ message: 'Missing video size.' });
        if (size > CLD_MAX_BYTES) return res.status(400).json({ message: 'Video must be 100 MB or less. Please compress it first.' });

        const publicId = CLD_PREFIX + crypto.randomBytes(12).toString('hex');
        const params = {
            public_id: publicId,
            type: 'authenticated',
            eager: CLD_POSTER_TX,
            eager_async: 'true',
            timestamp: Math.floor(Date.now() / 1000),
        };
        res.status(200).json({
            uploadUrl: `https://api.cloudinary.com/v1_1/${CLD_NAME}/video/upload`,
            publicId,
            fields: { ...params, api_key: CLD_KEY, signature: cldSignParams(params) },
        });
    } catch (error) {
        console.error('video-upload-signature error:', error.message);
        res.status(500).json({ message: 'Could not prepare the upload.' });
    }
});

// 2) After the browser finished uploading: confirm the file really is there,
//    within the size limit, and that the poster frame is ready. Returns the
//    facts to store, plus a one-time link to the poster frame (admin only).
app.post('/api/admin/video-finalize', videoAdminLimiter, async (req, res) => {
    try {
        if (!cldGuard(res)) return;
        if (!(await requireSignedIn(req, res, { admin: true }))) return;

        const publicId = String(req.body?.publicId || '');
        if (!CLD_PUBLIC_ID_RE.test(publicId)) return res.status(400).json({ message: 'Invalid video id.' });

        const { status, body } = await cldAdmin(`/resources/video/authenticated/${publicId}`);
        if (status === 404) return res.status(404).json({ message: 'The upload was not found.' });
        if (status !== 200) return res.status(502).json({ message: 'Video storage did not answer. Please try again.' });

        if (body.bytes > CLD_MAX_BYTES) {
            await cldDestroy(publicId).catch(() => {});
            return res.status(400).json({ message: 'Video must be 100 MB or less. Please compress it first.' });
        }

        const derived = Array.isArray(body.derived) ? body.derived : [];
        const poster = derived.find((d) => d.format === 'jpg' && d.bytes > 0);
        if (!poster) return res.status(200).json({ status: 'processing' });

        res.status(200).json({
            status: 'ready',
            publicId,
            resourceType: 'video',
            // the original file, which is exactly what students download
            bytes: body.bytes,
            duration: typeof body.duration === 'number' ? Math.round(body.duration * 10) / 10 : null,
            posterUrl: cldDeliveryUrl(publicId, CLD_POSTER_TX, 'jpg'),
        });
    } catch (error) {
        console.error('video-finalize error:', error.message);
        res.status(500).json({ message: 'Could not check the upload.' });
    }
});

// 3) A signed-in user asks to play a video. The signed link is made here on
//    every request and is never stored anywhere.
app.get('/api/video-url', async (req, res) => {
    try {
        if (!cldGuard(res)) return;
        const session = await requireSignedIn(req, res);
        if (!session) return;

        const materialId = Number(req.query.material);
        if (!Number.isInteger(materialId) || materialId <= 0) return res.status(400).json({ message: 'Invalid material.' });

        if (!videoUrlAllowed(session.authUser.id)) {
            return res.status(429).json({ message: 'Too many video requests. Please try again later.' });
        }

        // Read with the caller's OWN token so row-level security decides
        // whether this person may see the material at all.
        const asUser = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: `Bearer ${session.token}` } },
            auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: material } = await asUser
            .from('materials')
            .select('id, video_public_id, video_format, archived_at')
            .eq('id', materialId)
            .maybeSingle();

        const isAdmin = session.record.role === 'admin';
        if (
            !material?.video_public_id ||
            (material.archived_at && !isAdmin) ||
            !CLD_PUBLIC_ID_RE.test(material.video_public_id) ||
            !CLD_VIDEO_FORMAT_RE.test(material.video_format || '')
        ) {
            return res.status(404).json({ message: 'Video not found.' });
        }

        res.set('Cache-Control', 'no-store');
        res.status(200).json({ url: cldDeliveryUrl(material.video_public_id, '', material.video_format) });
    } catch (error) {
        console.error('video-url error:', error.message);
        res.status(500).json({ message: 'Could not load the video.' });
    }
});

// 4) Permanent removal. Either a material that is archived (Archive screen),
//    or an upload nothing references (cancelled form, replaced video).
app.post('/api/admin/delete-video', videoAdminLimiter, async (req, res) => {
    try {
        if (!cldGuard(res)) return;
        if (!(await requireSignedIn(req, res, { admin: true }))) return;

        let publicId = '';
        if (req.body?.materialId !== undefined) {
            const { data: material } = await supabase
                .from('materials')
                .select('id, video_public_id, archived_at')
                .eq('id', Number(req.body.materialId))
                .maybeSingle();
            if (!material) return res.status(404).json({ message: 'Material not found.' });
            if (!material.archived_at) return res.status(409).json({ message: 'Archive the material first.' });
            if (!material.video_public_id) return res.status(200).json({ deleted: false });
            publicId = material.video_public_id;
        } else {
            publicId = String(req.body?.publicId || '');
            if (!CLD_PUBLIC_ID_RE.test(publicId)) return res.status(400).json({ message: 'Invalid video id.' });
            const { count } = await supabase
                .from('materials')
                .select('id', { count: 'exact', head: true })
                .eq('video_public_id', publicId);
            if (count) return res.status(409).json({ message: 'That video is still in use.' });
        }

        await cldDestroy(publicId);
        res.status(200).json({ deleted: true });
    } catch (error) {
        console.error('delete-video error:', error.message);
        res.status(502).json({ message: 'Could not delete the video file. Nothing was removed from the library.' });
    }
});

// 5) A link leaked: give the video a new public_id. Every link already handed
//    out stops working; students simply get a new one the next time they play.
app.post('/api/admin/video-rotate', videoAdminLimiter, async (req, res) => {
    try {
        if (!cldGuard(res)) return;
        if (!(await requireSignedIn(req, res, { admin: true }))) return;

        const { data: material } = await supabase
            .from('materials')
            .select('id, video_public_id')
            .eq('id', Number(req.body?.materialId))
            .maybeSingle();
        if (!material?.video_public_id || !CLD_PUBLIC_ID_RE.test(material.video_public_id)) {
            return res.status(404).json({ message: 'This material has no hosted video.' });
        }

        const oldId = material.video_public_id;
        const newId = CLD_PREFIX + crypto.randomBytes(12).toString('hex');
        const renamed = await cldSignedUpload('/video/rename', { from_public_id: oldId, to_public_id: newId, type: 'authenticated', to_type: 'authenticated' });
        if (renamed.status !== 200) return res.status(502).json({ message: 'Video storage could not rename the video.' });

        const { error: updateError } = await supabase.from('materials').update({ video_public_id: newId }).eq('id', material.id);
        if (updateError) {
            await cldSignedUpload('/video/rename', { from_public_id: newId, to_public_id: oldId, type: 'authenticated', to_type: 'authenticated' });
            return res.status(500).json({ message: 'Could not save the new link. Nothing changed.' });
        }

        // Students play the original, which the rename moved as it is: nothing to rebuild.
        res.status(200).json({ rotated: true });
    } catch (error) {
        console.error('video-rotate error:', error.message);
        res.status(500).json({ message: 'Could not rotate the video link.' });
    }
});

// 6) Credit meter for the admin upload screen.
app.get('/api/admin/video-usage', videoAdminLimiter, async (req, res) => {
    try {
        if (!cldGuard(res)) return;
        if (!(await requireSignedIn(req, res, { admin: true }))) return;
        const { status, body } = await cldAdmin('/usage');
        if (status !== 200) return res.status(502).json({ message: 'Usage is not available right now.' });
        const used = Number(body?.credits?.usage ?? 0);
        const limit = Number(body?.credits?.limit ?? 25);
        const percent = limit > 0 ? Math.round((used / limit) * 1000) / 10 : 0;
        res.status(200).json({
            creditsUsed: used,
            creditsLimit: limit,
            percent,
            warn: percent >= CLD_FREE_CREDITS_WARN_PCT,
            storageBytes: Number(body?.storage?.usage ?? 0),
            bandwidthBytes: Number(body?.bandwidth?.usage ?? 0),
            updated: body?.last_updated || null,
        });
    } catch (error) {
        console.error('video-usage error:', error.message);
        res.status(500).json({ message: 'Usage is not available right now.' });
    }
});

export default app;

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Backend running on http://localhost:${PORT}`);
});