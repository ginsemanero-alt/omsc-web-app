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
    // A request the server refused for what was typed (a weak password, a
    // missing field, an email or ID already in use: all 400) creates nothing
    // and sends nothing, so it must not use up the student's 5 tries. Only a
    // request that passed validation counts (including one that then failed
    // on the server, a 5xx). The per-IP limiter below still counts everything.
    skipFailedRequests: true,
    requestWasSuccessful: (req, res) => res.statusCode < 400 || res.statusCode >= 500,
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
// Free models come and go. nvidia/nemotron-3-super-120b-a12b:free (the old
// primary) was still listed but answered 404 "Function not found", and
// google/gemma-4-31b-it:free was rate-limited upstream, so the button failed
// for everyone. The models below were checked on 2026-10-28 with the real
// prompt: laguna answers in ~3-7 s, nemotron-ultra in ~8-12 s. They are tried
// in order, each ONCE (a failed attempt still counts against the free daily
// quota), and the first that answers wins. To swap models WITHOUT a code
// change, set OPENROUTER_MODELS in Vercel to a comma-separated list of
// OpenRouter ids (most preferred first).
const DEFAULT_OPENROUTER_MODELS = [
    'poolside/laguna-s-2.1:free',
    'nvidia/nemotron-3-ultra-550b-a55b:free',
    'google/gemma-4-26b-a4b-it:free',
];
const OPENROUTER_MODELS = (process.env.OPENROUTER_MODELS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
if (OPENROUTER_MODELS.length === 0) OPENROUTER_MODELS.push(...DEFAULT_OPENROUTER_MODELS);
// What the admin sees whenever the AI service cannot answer (any cause).
const INSIGHT_UNAVAILABLE_MESSAGE = 'Insight is unavailable right now. Please try again later.';
if (!OPENROUTER_API_KEY) {
    console.warn('⚠️  OPENROUTER_API_KEY not set — the Analytics AI Insight feature is disabled until it is configured.');
}

// Deterministic hash of the aggregated numbers an insight was generated
// from — object key order isn't guaranteed stable across requests, so keys
// are sorted recursively before hashing; otherwise the same underlying
// data could hash differently and defeat the cache for no reason.
// An administrator is only treated as one while the account is active and not archived
// (matches is_admin() in the database, PHASE 44).
function isActiveAdmin(record) {
    return !!record && record.role === 'admin' && record.status === 'active' && !record.archived_at;
}

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

// The password rule the registration and set-password screens show: at least
// 8 characters with an uppercase letter, a lowercase letter and a number (no
// symbol required). Enforced here so a direct call to the API cannot skip the
// screen. It is applied only when a password is SET (registration); signing in
// never checks it, so accounts created with a shorter password still work.
const PASSWORD_RULE_MESSAGE = 'Password must be at least 8 characters and contain uppercase, lowercase, and a number.';
function passwordProblem(password) {
    if (typeof password !== 'string'
        || password.length < 8
        || password.length > 128
        || !/[A-Z]/.test(password)
        || !/[a-z]/.test(password)
        || !/[0-9]/.test(password)) {
        return PASSWORD_RULE_MESSAGE;
    }
    return null;
}

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

    const passwordError = passwordProblem(password);
    if (passwordError) {
        return res.status(400).json({ message: passwordError });
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

// ---- Administrator accounts (PHASE 45) ----------------------------------
// The role is always read from the database with the service key, never from
// the browser. An administrator can only be added by invitation: the server
// creates the account with a random password nobody sees, then sends the
// person the same "set your password" email as Forgot password. Every
// invite / deactivate / reactivate is written to the Activity Log here, on
// the server, so a browser cannot skip or forge it.

const ADMIN_CAMPUSES = ['San Jose Campus', 'Labangan Campus', 'Murtha Campus'];
const NOTE_INVITED = 'Invited as administrator';
const NOTE_DEACTIVATED = 'Deactivated';
const NOTE_REACTIVATED = 'Reactivated';
const LAST_ADMIN_MESSAGE = 'You cannot deactivate the last active administrator.';
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// How long a set-password link works. This is Supabase's "Email OTP expiration"
// (Authentication > Email), which is 3600 seconds (1 hour). It is the single
// setting the invitation email reads; if the Supabase value is ever changed,
// set AUTH_LINK_EXPIRY_SECONDS to match so the email never states a wrong time.
const AUTH_LINK_EXPIRY_SECONDS = Number(process.env.AUTH_LINK_EXPIRY_SECONDS) > 0
    ? Number(process.env.AUTH_LINK_EXPIRY_SECONDS)
    : 3600;

function plainDuration(totalSeconds) {
    const unit = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');
    if (totalSeconds % 3600 === 0) return unit(totalSeconds / 3600, 'hour');
    if (totalSeconds % 60 === 0) return unit(totalSeconds / 60, 'minute');
    return unit(totalSeconds, 'second');
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    ));
}

// The administrator invitation: its own email, separate from Forgot password.
// Sent with Resend; the link is the same secure Supabase recovery link.
async function sendAdminInviteEmail({ to, name, inviterName, link }) {
    if (!resend) return { error: new Error('Email sending is not configured.') };
    const expiry = plainDuration(AUTH_LINK_EXPIRY_SECONDS);
    const subject = "You've been invited as an administrator — OMSU Guidance";
    const safeName = escapeHtml(name);
    const safeInviter = escapeHtml(inviterName);
    const safeLink = escapeHtml(link);
    const html = `
        <div style="font-family: Arial, Helvetica, sans-serif; max-width: 520px; margin: 0 auto; color: #1e293b; line-height: 1.6;">
            <h2 style="color: #4f46e5; margin-bottom: 4px;">You've been invited as an administrator</h2>
            <p>Hello ${safeName},</p>
            <p><strong>${safeInviter}</strong> invited you to be an administrator of <strong>OMSU Guidance</strong>, the Guidance and Testing Center administrator portal. You will use it to manage programs, materials and surveys.</p>
            <p>To start, set your password:</p>
            <p style="margin: 24px 0;">
                <a href="${safeLink}" style="display:inline-block;background:#4f46e5;color:#ffffff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:bold;">Set your password</a>
            </p>
            <p style="color:#475569;">This link expires in ${expiry}. If it has expired, open the sign-in page and choose "Forgot password" to get a new one.</p>
            <p style="color:#475569;font-size:13px;">If the button does not work, copy this link into your browser:<br><span style="word-break:break-all;">${safeLink}</span></p>
            <p style="color:#94a3b8;font-size:12px;border-top:1px solid #e2e8f0;padding-top:12px;margin-top:24px;">If you weren't expecting this, ignore this email. No account changes happen until you set a password.</p>
        </div>
    `;
    const text = [
        "You've been invited as an administrator",
        '',
        'Hello ' + name + ',',
        '',
        inviterName + ' invited you to be an administrator of OMSU Guidance, the Guidance and Testing Center administrator portal.',
        '',
        'Set your password: ' + link,
        '',
        'This link expires in ' + expiry + '.',
        '',
        "If you weren't expecting this, ignore this email.",
    ].join('\n');
    return resend.emails.send({ from: RESEND_FROM, to, subject, html, text });
}

// Verifies the bearer token and that the caller is an active administrator.
// Sends the error response itself and returns null when the caller is not.
async function requireActiveAdmin(req, res, forbiddenMessage) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
        res.status(401).json({ message: 'Missing authorization token' });
        return null;
    }
    const { data: { user: authUser }, error: callerError } = await supabase.auth.getUser(token);
    if (callerError || !authUser?.email) {
        res.status(401).json({ message: 'Invalid or expired session' });
        return null;
    }
    const { data: record } = await supabase
        .from('users')
        .select('id, name, email, role, status, archived_at')
        .eq('email', authUser.email.toLowerCase())
        .maybeSingle();
    if (!isActiveAdmin(record)) {
        res.status(403).json({ message: forbiddenMessage });
        return null;
    }
    return { authUser, record };
}

// The Auth identity that belongs to a users row (the two only share the email).
async function findAuthUserByEmail(email) {
    const wanted = String(email || '').toLowerCase();
    const perPage = 200;
    for (let page = 1; page <= 50; page += 1) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
        if (error) throw error;
        const match = data.users.find((u) => u.email?.toLowerCase() === wanted);
        if (match) return match;
        if (data.users.length < perPage) break;
    }
    return null;
}

// Written by the server with the service key. Never lets a logging problem
// fail the action that already happened.
async function writeAdminLog(actor, action, target, details) {
    try {
        await supabase.from('activity_logs').insert([{
            actor_email: actor.email,
            actor_name: actor.name || actor.email,
            action,
            entity_type: 'user',
            entity_id: String(target.id),
            entity_label: target.name || target.email,
            details,
        }]);
    } catch (logErr) {
        console.warn('Activity log write failed (admin accounts):', logErr.message);
    }
}

app.post('/api/admin/invite-admin', createStaffLimiter, async (req, res) => {
    try {
        const caller = await requireActiveAdmin(req, res, 'Only active administrators can add administrators.');
        if (!caller) return;

        const { name, email, campus } = req.body || {};
        const cleanName = typeof name === 'string' ? name.trim() : '';
        const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
        const cleanCampus = ADMIN_CAMPUSES.includes(campus) ? campus : null;

        if (!cleanName || cleanName.length > 100) {
            return res.status(400).json({ message: 'Please enter the full name.' });
        }
        if (!EMAIL_SHAPE.test(cleanEmail) || cleanEmail.length > 254) {
            return res.status(400).json({ message: 'Please enter a valid email address.' });
        }

        const { data: existing } = await supabase.from('users').select('id').eq('email', cleanEmail);
        if (existing && existing.length > 0) {
            return res.status(400).json({ message: 'An account with this email already exists.' });
        }

        // Nobody ever sees or types this. It only exists because the account
        // needs one until the person sets their own through the email link.
        const placeholder = crypto.randomBytes(32).toString('base64url');
        const { data: authCreate, error: authCreateError } = await supabase.auth.admin.createUser({
            email: cleanEmail,
            password: placeholder,
            email_confirm: true,
            user_metadata: { name: cleanName, role: 'admin' },
        });
        if (authCreateError) {
            if (/already|registered|exists/i.test(authCreateError.message || '')) {
                return res.status(400).json({ message: 'An account with this email already exists.' });
            }
            throw authCreateError;
        }
        const authUserId = authCreate.user.id;

        const { data: inserted, error: dbError } = await supabase
            .from('users')
            .insert([{
                name: cleanName,
                email: cleanEmail,
                password: await bcrypt.hash(placeholder, 10),
                role: 'admin',
                campus: cleanCampus,
                status: 'active',
                is_test_account: false,
            }])
            .select('id, name, email');
        if (dbError) {
            await supabase.auth.admin.deleteUser(authUserId);
            throw dbError;
        }
        const created = inserted[0];

        // Same email as Forgot password, same page. The link goes back to the
        // site the admin is using, if that is a known origin.
        const origin = req.headers.origin;
        const siteUrl = (origin && allowedOrigins.includes(origin)
            ? origin
            : (process.env.SITE_URL || 'https://www.webguidance.online')).replace(/\/$/, '');
        // The same secure recovery link Forgot password uses, but sent in the
        // invitation email below instead of the "reset password" email.
        const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
            type: 'recovery',
            email: cleanEmail,
            options: { redirectTo: siteUrl + '/reset-password' },
        });
        let mailError = linkError || (linkData?.properties?.action_link ? null : new Error('No link was generated.'));
        if (!mailError) {
            const sent = await sendAdminInviteEmail({
                to: cleanEmail,
                name: cleanName,
                inviterName: caller.record.name || caller.record.email,
                link: linkData.properties.action_link,
            });
            mailError = sent?.error || null;
        }
        if (mailError) {
            // An account nobody can sign in to is worse than none: undo it.
            await supabase.from('users').delete().eq('id', created.id);
            await supabase.auth.admin.deleteUser(authUserId);
            console.warn('Invite email not sent:', mailError.message);
            return res.status(502).json({ message: "We couldn't send the invitation email, so no account was created. Please try again in a minute." });
        }

        await writeAdminLog(caller.record, 'create', created, NOTE_INVITED);
        res.status(201).json({ message: 'Invitation sent.', userId: created.id, emailSent: true });
    } catch (error) {
        console.error('Invite Admin Error:', error.message);
        res.status(500).json({ message: 'Could not add the administrator. Please try again.' });
    }
});

app.post('/api/admin/set-admin-status', deleteUserLimiter, async (req, res) => {
    try {
        const caller = await requireActiveAdmin(req, res, 'Only active administrators can change administrator accounts.');
        if (!caller) return;

        const { userId, active } = req.body || {};
        if (!userId || typeof active !== 'boolean') {
            return res.status(400).json({ message: 'userId and active (true or false) are required.' });
        }

        const { data: target } = await supabase
            .from('users')
            .select('id, name, email, role, status, archived_at')
            .eq('id', userId)
            .maybeSingle();
        if (!target) return res.status(404).json({ message: 'User not found' });
        if (target.role !== 'admin') {
            return res.status(400).json({ message: 'Only administrator accounts can be deactivated or reactivated here.' });
        }
        if (target.archived_at) {
            return res.status(400).json({ message: 'This account is archived. Restore it from the Archive first.' });
        }

        const isSelf = String(target.id) === String(caller.record.id);
        const currentlyActive = target.status === 'active';

        if (!active) {
            if (isSelf) return res.status(400).json({ message: "You can't deactivate your own account." });
            if (!currentlyActive) return res.status(400).json({ message: 'This account is already inactive.' });

            const { count: otherAdmins } = await supabase
                .from('users')
                .select('id', { count: 'exact', head: true })
                .eq('role', 'admin')
                .eq('status', 'active')
                .is('archived_at', null)
                .neq('id', target.id);
            if (!otherAdmins) return res.status(400).json({ message: LAST_ADMIN_MESSAGE });

            const { error: statusError } = await supabase.from('users').update({ status: 'inactive' }).eq('id', target.id);
            if (statusError) {
                // The database refuses the last active admin too (second layer).
                return res.status(statusError.code === '23514' ? 400 : 500).json({
                    message: statusError.code === '23514' ? LAST_ADMIN_MESSAGE : 'Could not deactivate the account.',
                });
            }
            // Sign-in with Supabase Auth is blocked as well, so a session cannot be renewed.
            try {
                const authUser = await findAuthUserByEmail(target.email);
                if (authUser) {
                    const { error: banError } = await supabase.auth.admin.updateUserById(authUser.id, { ban_duration: '876000h' });
                    if (banError) throw banError;
                }
            } catch (banErr) {
                await supabase.from('users').update({ status: 'active' }).eq('id', target.id);
                console.error('Deactivate: could not block sign-in:', banErr.message);
                return res.status(500).json({ message: 'Could not block sign-in, so the account was left active. Please try again.' });
            }
            await writeAdminLog(caller.record, 'update', target, NOTE_DEACTIVATED);
            return res.status(200).json({ message: 'Account deactivated.', status: 'inactive' });
        }

        if (currentlyActive) return res.status(400).json({ message: 'This account is already active.' });
        try {
            const authUser = await findAuthUserByEmail(target.email);
            if (authUser) {
                const { error: unbanError } = await supabase.auth.admin.updateUserById(authUser.id, { ban_duration: 'none' });
                if (unbanError) throw unbanError;
            }
        } catch (unbanErr) {
            console.error('Reactivate: could not allow sign-in:', unbanErr.message);
            return res.status(500).json({ message: 'Could not re-enable sign-in. Please try again.' });
        }
        const { error: reError } = await supabase.from('users').update({ status: 'active' }).eq('id', target.id);
        if (reError) return res.status(500).json({ message: 'Could not reactivate the account.' });
        await writeAdminLog(caller.record, 'update', target, NOTE_REACTIVATED);
        res.status(200).json({ message: 'Account reactivated.', status: 'active' });
    } catch (error) {
        console.error('Set Admin Status Error:', error.message);
        res.status(500).json({ message: 'Could not change the account. Please try again.' });
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
            .select('id, name, role, status, archived_at')
            .eq('email', callerAuthUser.email.toLowerCase())
            .maybeSingle();

        if (!isActiveAdmin(callerRecord)) {
            return res.status(403).json({ message: "Only admins can delete accounts" });
        }

        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({ message: "userId is required" });
        }

        const { data: targetUser, error: targetError } = await supabase
            .from('users')
            .select('id, name, email, role')
            .eq('id', userId)
            .maybeSingle();

        if (targetError) throw targetError;
        if (!targetUser) {
            return res.status(404).json({ message: "User not found" });
        }
        // Administrator accounts are never removed from here: deactivating one
        // keeps its history in the Activity Log, deleting it would not.
        if (targetUser.role === 'admin') {
            return res.status(400).json({ message: "Administrator accounts can't be deleted. Deactivate the account instead." });
        }
        if (String(targetUser.id) === String(callerRecord.id)) {
            return res.status(400).json({ message: "You can't delete your own account." });
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

        // A deactivated account cannot sign in (administrators are also blocked
        // in Supabase Auth when deactivated).
        if (user.status && user.status !== 'active') {
            return res.status(403).json({
                code: 'account_inactive',
                message: 'This account is inactive. Please contact the guidance office.',
            });
        }

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
            .select('role, status, archived_at, is_test_account')
            .eq('email', callerAuthUser.email.toLowerCase())
            .maybeSingle();

        if (!isActiveAdmin(callerRecord)) {
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
            .select('role, status, archived_at')
            .eq('email', callerAuthUser.email.toLowerCase())
            .maybeSingle();

        if (!isActiveAdmin(callerRecord)) {
            return res.status(403).json({ message: "Only admins can generate analytics insights" });
        }

        if (!OPENROUTER_API_KEY) {
            return res.status(503).json({ message: INSIGHT_UNAVAILABLE_MESSAGE });
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
        for (const model of OPENROUTER_MODELS) {
            try {
                insightText = await callOpenRouter(model, metrics, sectionLabel);
                modelUsed = model;
                break;
            } catch (modelError) {
                // The provider's own message goes to the function log (never
                // to the browser, and it never contains the key).
                console.warn('analytics-insight: model failed:', modelError.message);
            }
        }
        if (!insightText) {
            console.error(`analytics-insight: all ${OPENROUTER_MODELS.length} models failed`);
            return res.status(502).json({ message: INSIGHT_UNAVAILABLE_MESSAGE });
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
        .select('role, status, archived_at')
        .eq('email', authUser.email.toLowerCase())
        .maybeSingle();
    if (!record || record.archived_at) {
        res.status(403).json({ message: 'This account cannot use this feature.' });
        return null;
    }
    if (admin && !isActiveAdmin(record)) {
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

        const isAdmin = isActiveAdmin(session.record);
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