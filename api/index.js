import 'dotenv/config';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import cors from 'cors';
import bcrypt from 'bcryptjs'; // ← bcryptjs, hindi bcrypt (mas stable sa Vercel serverless)
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Resend } from 'resend';


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

// Registration spam / mass fake-account creation.
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
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

// Light blanket cap on every /api/* route as a general safety net against
// scripted abuse/scraping, on top of the stricter limiters above.
const globalApiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
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

// --- ROUTES ---

app.get('/api/health', (req, res) => {
    res.status(200).json({ status: "OK", message: "Backend is running" });
});

app.post('/api/register', registerLimiter, async (req, res) => {
    const {
        studentId, name, email, password, campus,
        program, yearLevel, status, age, gender, isIp, isPwd
    } = req.body;

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

    // The registration form offers "Yes" / "No" / "Prefer not to say", but
    // profiles.is_ip and profiles.is_pwd are strict booleans (same as the
    // profile-edit form's plain Yes/No toggle) — anything other than an
    // explicit "Yes" is treated as false, since Postgres can't cast
    // "Prefer not to say" to boolean and that would crash the insert.
    const toBool = (value) => value === 'Yes';

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
        const { data: authCreate, error: authCreateError } = await supabase.auth.admin.createUser({
            email: cleanEmail,
            password: password,
            email_confirm: true,
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
                status: status || 'active'
            }])
            .select();

        if (dbError) {
            await supabase.auth.admin.deleteUser(authUserId);
            throw dbError;
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

        res.status(201).json({ message: "Account created!", userId: data[0].id });
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

        const { name, email, password, campus } = req.body;
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
                status: 'active'
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
            const { data: recovery } = await supabaseAnon.auth.signInWithPassword({
                email: cleanEmail,
                password: password,
            });

            if (!recovery?.session) {
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

// Fans out one email to every active student when the admin publishes a
// new Program or activates a new Survey. Same admin-session-check shape
// as /api/admin/create-staff — this sends real email to potentially every
// student in the system, so it's gated the same way.
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
            .select('role')
            .eq('email', callerAuthUser.email.toLowerCase())
            .maybeSingle();

        if (callerRecord?.role !== 'admin') {
            return res.status(403).json({ message: "Only admins can send student notifications" });
        }

        if (!resend) {
            console.warn('Skipped student notification — RESEND_API_KEY not configured.');
            return res.status(200).json({ sent: 0, skipped: true, message: "Email notifications are not configured yet." });
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
            .select('email')
            .eq('role', 'student')
            .eq('status', 'active');

        if (studentsError) throw studentsError;

        const recipients = [...new Set((students || []).map((s) => s.email).filter(Boolean))];
        if (recipients.length === 0) {
            return res.status(200).json({ sent: 0, message: "No active students to notify." });
        }

        const siteUrl = (process.env.SITE_URL || 'https://www.webguidance.online').replace(/\/$/, '');
        const link = `${siteUrl}${actionPath || (type === 'program' ? '/student/programs' : '/student/survey')}`;
        const subject = type === 'program'
            ? `New Guidance Program: ${title}`
            : `New Survey Available: ${title}`;
        const html = `
            <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; color: #1e293b;">
                <h2 style="color: #4f46e5; margin-bottom: 4px;">${subject}</h2>
                <p style="color: #475569; line-height: 1.6;">${(details || '').trim() || `A new ${type === 'program' ? 'guidance program' : 'survey'} titled "${title}" has just been posted.`}</p>
                <p style="margin: 24px 0;">
                    <a href="${link}" style="display:inline-block;background:#4f46e5;color:#ffffff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:bold;">
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

        res.status(200).json({ sent: sentCount, total: recipients.length });
    } catch (error) {
        console.error("Notify Students Error:", error.message);
        res.status(500).json({ message: error.message });
    }
});

export default app;

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Backend running on http://localhost:${PORT}`);
});