import 'dotenv/config';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import cors from 'cors';
import bcrypt from 'bcryptjs'; // ← bcryptjs, hindi bcrypt (mas stable sa Vercel serverless)


const app = express();

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

// --- ROUTES ---

app.get('/api/health', (req, res) => {
    res.status(200).json({ status: "OK", message: "Backend is running" });
});

app.post('/api/register', async (req, res) => {
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

        res.status(201).json({ message: "Account created!", userId: data[0].id });
    } catch (error) {
        console.error("Registration Error:", error.message);
        res.status(500).json({ message: error.message });
    }
});

app.post('/api/admin/create-staff', async (req, res) => {
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

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    const cleanEmail = email?.trim().toLowerCase();

    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', cleanEmail)
            .maybeSingle();

        if (!user) return res.status(404).json({ message: "User not found" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

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

export default app;

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Backend running on http://localhost:${PORT}`);
});