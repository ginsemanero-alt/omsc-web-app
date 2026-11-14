// Learning gain figures for the AI Insight, worked out on the server from the same tables and the same
// rules as learning_gain_summary() (the Learning gain card):
//   * test accounts are left out; knowledge assessments linked to a program; pre-test and post-test only;
//   * one pre/post pair per student per assessment (the best score of each, the first pre-test's time);
//   * a pair is left out when the student opened one of the program's linked materials at or before the
//     pre-test (the pre-test is then not a true baseline);
//   * a student's profile = the sign-in account's profile (by e-mail), else the profile with the same student ID.
//
// Why this exists: the SQL returns RECORD-level numbers (one record = one student in one program). The insight
// must also tell students from records and test significance across STUDENTS (one averaged pair per student,
// n = number of students), which needs per-student data the SQL does not return. Only aggregates leave this file:
// no name, e-mail, student ID or individual record is ever part of the result.
//
// Nothing here writes to the database.

const SMALL_GROUP = 5; // fewer than this many STUDENTS = "small group, interpret with caution"
const T_CAUTION = 30;

// ---------- statistics
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a) => {
    const m = mean(a);
    return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
};
const round = (v, d) => (v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(d)));

function logGamma(x) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x;
    let t = x + 5.5;
    t -= (x + 0.5) * Math.log(t);
    let s = 1.000000000190015;
    for (const k of c) s += k / ++y;
    return -t + Math.log((2.5066282746310005 * s) / x);
}
function betaCF(a, b, x) {
    const qab = a + b;
    const qap = a + 1;
    const qam = a - 1;
    let c = 1;
    let d = 1 - (qab * x) / qap;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= 300; m++) {
        const m2 = 2 * m;
        let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
        d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30;
        c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
        d = 1 / d; h *= d * c;
        aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
        d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30;
        c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
        d = 1 / d;
        const del = d * c;
        h *= del;
        if (Math.abs(del - 1) < 3e-12) break;
    }
    return h;
}
function incompleteBeta(x, a, b) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? (bt * betaCF(a, b, x)) / a : 1 - (bt * betaCF(b, a, 1 - x)) / b;
}
export const twoTailedP = (t, df) => Math.min(1, Math.max(0, incompleteBeta(df / (df + t * t), df / 2, 0.5)));

// How the Learning gain card prints a p-value: "p < .001" or "p = .017".
const pText = (p) => (p < 0.001 ? 'p < .001' : `p = ${p.toFixed(3).replace(/^0/, '')}`);

// Paired t-test on the differences (post - pre), with the unrounded p. null when it cannot be worked out.
function ttestFull(diffs) {
    const n = diffs.length;
    if (n < 2) return null;
    const md = mean(diffs);
    const s = sd(diffs);
    if (!s) return null;
    const t = md / (s / Math.sqrt(n));
    return { n, t, df: n - 1, p: twoTailedP(t, n - 1) };
}

// The test as it is printed: "t(84) = 7.15, p < .001".
export function pairedTTest(diffs) {
    const r = ttestFull(diffs);
    if (!r) return null;
    return { students: r.n, t: round(r.t, 2), df: r.df, pValue: pText(r.p), significantAtP05: r.p < 0.05 };
}

// Holm step-down adjustment of a family of p-values (null stays null). Adjusted p is never below the
// previous one in the sorted order and never above 1.
export function holmAdjust(ps) {
    const idx = ps.map((p, i) => [p, i]).filter(([p]) => p !== null && p !== undefined).sort((a, b) => a[0] - b[0]);
    const m = idx.length;
    const out = ps.map(() => null);
    let running = 0;
    idx.forEach(([p, i], rank) => {
        running = Math.max(running, Math.min(1, (m - rank) * p));
        out[i] = running;
    });
    return out;
}

// ---------- grouping rules (same as the SQL)
const YEAR_LABELS = { 1: '1st Year', 2: '2nd Year', 3: '3rd Year', 4: '4th Year', 5: '5th Year' };

function ageBracketOf(age, brackets) {
    if (age === null || age === undefined) return 'Not specified';
    const b = brackets.find((x) => age >= x.min && (x.max === null || age <= x.max));
    return b ? b.label : 'Outside brackets';
}

// brackets from the request are untrusted: keep only well-formed ones.
export function cleanBrackets(input) {
    const fallback = [
        { label: '19 and below', min: 0, max: 19 },
        { label: '20–22', min: 20, max: 22 },
        { label: '23 and above', min: 23, max: null },
    ];
    if (!Array.isArray(input) || input.length === 0 || input.length > 10) return fallback;
    const ok = input.every((b) => b && typeof b.label === 'string' && b.label.length <= 40 && Number.isFinite(b.min) && (b.max === null || Number.isFinite(b.max)));
    return ok ? input.map((b) => ({ label: b.label, min: b.min, max: b.max })) : fallback;
}

// ---------- the pairing itself
// raw = { responses, users, surveys, views, programMaterials, profiles, authIdByEmail, programTitles }
export function buildPairs(raw) {
    const users = new Map(raw.users.map((u) => [u.id, u]));
    const surveys = new Map(raw.surveys.map((s) => [s.id, s]));
    const pct = (r) => (r.total_scored ? (r.score * 100) / r.total_scored : r.percentage);

    const per = new Map();
    for (const r of raw.responses) {
        const s = surveys.get(r.survey_id);
        if (!s || s.type !== 'knowledge' || !s.program_id) continue;
        if (r.attempt_type !== 'pre' && r.attempt_type !== 'post') continue;
        const u = users.get(r.user_id);
        if (!u || u.is_test_account) continue;
        const key = `${r.user_id}|${r.survey_id}`;
        const o = per.get(key) || { user_id: r.user_id, program_id: s.program_id, pre: null, post: null, pre_at: null };
        const v = pct(r);
        if (r.attempt_type === 'pre') {
            o.pre = o.pre === null ? v : Math.max(o.pre, v);
            if (!o.pre_at || r.created_at < o.pre_at) o.pre_at = r.created_at;
        } else {
            o.post = o.post === null ? v : Math.max(o.post, v);
        }
        per.set(key, o);
    }

    const linked = new Map();
    for (const pm of raw.programMaterials) {
        if (!linked.has(pm.program_id)) linked.set(pm.program_id, new Set());
        linked.get(pm.program_id).add(pm.material_id);
    }
    const viewsByUser = new Map();
    for (const v of raw.views) {
        if (!viewsByUser.has(v.user_id)) viewsByUser.set(v.user_id, []);
        viewsByUser.get(v.user_id).push(v);
    }

    const rows = [...per.values()].filter((o) => o.pre !== null);
    for (const o of rows) {
        const set = linked.get(o.program_id) || new Set();
        o.viewedBeforePre = (viewsByUser.get(o.user_id) || []).some((v) => set.has(v.material_id) && v.first_viewed_at <= o.pre_at);
    }
    return rows;
}

function profileOf(user, raw, profileById, profileByStudentId) {
    const authId = raw.authIdByEmail.get(String(user.email || '').toLowerCase());
    return (authId && profileById.get(authId)) || (user.student_id && profileByStudentId.get(user.student_id)) || null;
}

// Profile attributes of every student in `rows`, grouped the way the SQL groups them.
function studentAttributes(raw, rows, brackets) {
    const users = new Map(raw.users.map((u) => [u.id, u]));
    const profileById = new Map(raw.profiles.map((p) => [p.id, p]));
    const profileByStudentId = new Map(raw.profiles.filter((p) => p.student_id).map((p) => [p.student_id, p]));
    const attr = new Map();
    for (const o of rows) {
        if (attr.has(o.user_id)) continue;
        const p = profileOf(users.get(o.user_id), raw, profileById, profileByStudentId) || {};
        const yearRaw = String((p.year_level || '').trim());
        attr.set(o.user_id, {
            course: (p.program || '').trim() || 'Not specified',
            yearRaw: yearRaw || 'Not specified',
            yearLevel: yearRaw ? YEAR_LABELS[yearRaw] || yearRaw : 'Not specified',
            gender: (p.gender || '').trim() || 'Not specified',
            ageBand: ageBracketOf(p.age, brackets),
            age: p.age === null || p.age === undefined ? null : Number(p.age),
            campus: String(p.campus || '').trim().toLowerCase(),
            pwd: p.is_pwd ? 'PWD' : 'Non-PWD',
            ip: p.is_ip ? 'IP' : 'Non-IP',
        });
    }
    return attr;
}

// ---------- the student-level test for the Learning gain CARD, under the card's own filters
// `params` are the card's RPC parameters (p_program_id, p_course, p_year_level, p_gender, p_age_min, p_age_max,
// p_campus, p_pwd, p_ip, p_academic_year). The filters work like the SQL: they choose which pairs count; each
// remaining student is then counted once, with their pre-test and post-test averaged over their records.
export function buildStudentLevelTest(raw, params = {}) {
    const rows = buildPairs(raw);
    const attr = studentAttributes(raw, rows, cleanBrackets(null));
    const has = (v) => v !== null && v !== undefined && v !== '';
    const pairs = rows.filter((o) => {
        if (o.post === null || o.viewedBeforePre) return false;
        const a = attr.get(o.user_id);
        if (has(params.p_program_id) && o.program_id !== Number(params.p_program_id)) return false;
        if (has(params.p_course) && a.course !== params.p_course) return false;
        if (has(params.p_year_level) && a.yearRaw !== String(params.p_year_level)) return false;
        if (has(params.p_gender) && a.gender !== params.p_gender) return false;
        if (has(params.p_campus) && a.campus !== String(params.p_campus).trim().toLowerCase()) return false;
        if (has(params.p_age_min) || has(params.p_age_max)) {
            if (a.age === null) return false;
            if (has(params.p_age_min) && a.age < Number(params.p_age_min)) return false;
            if (has(params.p_age_max) && a.age > Number(params.p_age_max)) return false;
        }
        if (typeof params.p_pwd === 'boolean' && (a.pwd === 'PWD') !== params.p_pwd) return false;
        if (typeof params.p_ip === 'boolean' && (a.ip === 'IP') !== params.p_ip) return false;
        if (has(params.p_academic_year) && new Date(o.pre_at).getUTCFullYear() !== Number(params.p_academic_year)) return false;
        return true;
    });
    const byStudent = new Map();
    for (const o of pairs) {
        const a = byStudent.get(o.user_id) || { pre: [], post: [] };
        a.pre.push(o.pre);
        a.post.push(o.post);
        byStudent.set(o.user_id, a);
    }
    const stu = [...byStudent.values()].map((a) => ({ pre: mean(a.pre), post: mean(a.post) }));
    const diffs = stu.map((x) => x.post - x.pre);
    return {
        students: stu.length,
        matchedRecords: pairs.length,
        studentLevelMeans: stu.length ? { preTestMeanPercent: round(mean(stu.map((x) => x.pre)), 1), postTestMeanPercent: round(mean(stu.map((x) => x.post)), 1), gainPoints: round(mean(diffs), 1) } : null,
        pairedTTest: pairedTTest(diffs),
    };
}

// ---------- the result
export function buildLearningGainForInsight(raw, ageBracketsInput) {
    const brackets = cleanBrackets(ageBracketsInput);
    const rows = buildPairs(raw);

    const pairs = rows.filter((o) => o.post !== null && !o.viewedBeforePre);
    const preOnly = rows.filter((o) => o.post === null && !o.viewedBeforePre);
    const excluded = rows.filter((o) => o.viewedBeforePre);

    // profile attributes per student
    const attr = studentAttributes(raw, rows, brackets);

    // ----- record-level aggregate of a set of pairs (the same figures the page shows)
    const recordStats = (list) => {
        const n = list.length;
        if (n === 0) return { matchedRecords: 0 };
        const pre = mean(list.map((o) => o.pre));
        const post = mean(list.map((o) => o.post));
        return {
            matchedRecords: n,
            preTestMeanPercent: round(pre, 1),
            postTestMeanPercent: round(post, 1),
            gainPoints: round(post - pre, 1),
            normalizedGain: pre >= 100 ? null : round((post - pre) / (100 - pre), 2),
        };
    };
    const studentCount = (list) => new Set(list.map((o) => o.user_id)).size;

    // ----- student level: one averaged pre/post pair per student
    const byStudent = new Map();
    for (const o of pairs) {
        const a = byStudent.get(o.user_id) || { pre: [], post: [] };
        a.pre.push(o.pre);
        a.post.push(o.post);
        byStudent.set(o.user_id, a);
    }
    const stu = [...byStudent.values()].map((a) => ({ pre: mean(a.pre), post: mean(a.post) }));
    const diffs = stu.map((x) => x.post - x.pre);
    const sPre = stu.length ? mean(stu.map((x) => x.pre)) : null;
    const sPost = stu.length ? mean(stu.map((x) => x.post)) : null;

    const overall = {
        students: stu.length,
        matchedPrePostRecords: pairs.length,
        howToRead: `${pairs.length} matched pre/post records from ${stu.length} students (a record is one student's pre-test and post-test on one program's assessment; a student can have up to 5 records).`,
        preTestOnlyRecords: preOnly.length,
        recordsLeftOutBecauseMaterialOpenedBeforePreTest: excluded.length,
        // The main figures: all matched records, the same numbers as the Learning gain card.
        mainFigures: { students: stu.length, ...recordStats(pairs) },
        // The significance test across STUDENTS (each student counts once). Its means are averages of each
        // student's own records, so they differ slightly from the main figures; they are not the headline numbers.
        significanceTest: stu.length
            ? {
                basedOn: 'student-level paired t-test: one averaged pre/post pair per student, so n is the number of students',
                students: stu.length,
                pairedTTest: pairedTTest(diffs),
                studentLevelMeansUsedForTheTTest: {
                    preTestMeanPercent: round(sPre, 1),
                    postTestMeanPercent: round(sPost, 1),
                    gainPoints: round(sPost - sPre, 1),
                    sdOfStudentGainsPoints: stu.length > 1 ? round(sd(diffs), 1) : null,
                },
            }
            : null,
    };

    // ----- per program (one record = one student, so records = students here)
    const programIds = [...new Set(rows.map((o) => o.program_id))].sort((a, b) => a - b);
    // The programs are tested together, so their p-values are adjusted for that (Holm). Only the adjusted
    // values are sent: they are the ones to report.
    const programTests = programIds.map((pid) => ttestFull(pairs.filter((o) => o.program_id === pid).map((o) => o.post - o.pre)));
    const holm = holmAdjust(programTests.map((t) => (t ? t.p : null)));
    const byProgram = programIds.map((pid, i) => {
        const list = pairs.filter((o) => o.program_id === pid);
        const students = studentCount(list);
        const test = programTests[i];
        return {
            program: (raw.programTitles.get(pid) || `Program ${pid}`).trim(),
            students,
            ...recordStats(list),
            pairedTTest: test
                ? { students: test.n, t: round(test.t, 2), df: test.df, pValueHolmAdjusted: pText(holm[i]), significantAtP05AfterHolm: holm[i] < 0.05 }
                : null,
            smallGroup: students > 0 && students < SMALL_GROUP,
            basedOnStudents: students,
            preTestOnlyStudents: new Set(preOnly.filter((o) => o.program_id === pid).map((o) => o.user_id)).size,
        };
    });

    // ----- groups pooled across programs: students counted once, records counted separately
    const groupRows = (dimension) => {
        const keys = [...new Set(pairs.map((o) => attr.get(o.user_id)[dimension]))];
        return keys
            .map((key) => {
                const list = pairs.filter((o) => attr.get(o.user_id)[dimension] === key);
                const students = studentCount(list);
                return {
                    group: key,
                    students,
                    ...recordStats(list),
                    smallGroup: students > 0 && students < SMALL_GROUP,
                    basedOnStudents: students,
                };
            })
            .sort((a, b) => b.students - a.students || a.group.localeCompare(b.group));
    };
    const dims = {
        byYearLevel: groupRows('yearLevel'),
        byGender: groupRows('gender'),
        byAgeBand: groupRows('ageBand'),
        byPwdStatus: groupRows('pwd'),
        byIpStatus: groupRows('ip'),
        byCourse: groupRows('course'),
    };

    // ----- ready-made comparisons, so the AI does not have to work anything out
    // Only groups of at least SMALL_GROUP students take part, and every comparison states its measure.
    const pick = (list, key, dir) => {
        const ok = list.filter((r) => !r.smallGroup && r[key] !== null && r[key] !== undefined);
        if (ok.length < 2) return null;
        const best = [...ok].sort((a, b) => (dir === 'max' ? b[key] - a[key] : a[key] - b[key]))[0];
        return { group: best.group || best.program, basedOnStudents: best.basedOnStudents, [key]: best[key], postTestMeanPercent: best.postTestMeanPercent, gainPoints: best.gainPoints };
    };
    const callouts = (list) => ({
        highestPostTestMean: pick(list, 'postTestMeanPercent', 'max'),
        lowestPostTestMean: pick(list, 'postTestMeanPercent', 'min'),
        largestGain: pick(list, 'gainPoints', 'max'),
        smallestGain: pick(list, 'gainPoints', 'min'),
    });

    return {
        about:
            'Pre-test vs post-test on each program\'s knowledge assessment. Test accounts are left out. A pair is left out when the student opened a linked material before the pre-test. ' +
            'Percentages are labelled: preTestMeanPercent, postTestMeanPercent, gainPoints (post minus pre, in percentage points) and normalizedGain ((post - pre) / (100 - pre) of the means). The overall figures in mainFigures come from all matched records. ' +
            'Not affected by the dashboard filters.',
        overall,
        byProgram,
        ...dims,
        comparisons: {
            measureNote: 'Programs and groups are ranked by postTestMeanPercent, and the gain is always given next to it. Groups under 5 students are not ranked.',
            programs: callouts(byProgram.map((r) => ({ ...r, group: r.program }))),
            yearLevel: callouts(dims.byYearLevel),
            gender: callouts(dims.byGender),
            ageBand: callouts(dims.byAgeBand),
        },
        smallGroupRule: `A group of fewer than ${SMALL_GROUP} students has smallGroup = true: say "based on N students" and that it should be read with caution. A paired t-test is given only for the overall result (student level) and for each program (Holm-adjusted p-values), not for the other groups.`,
        cautionForTTest: `${T_CAUTION} students or fewer: read the t-test with caution.`,
    };
}

// ---------- data loader (read-only; the Supabase client returns at most 1000 rows per request)
async function fetchAll(query) {
    const out = [];
    for (let from = 0; ; from += 1000) {
        const { data, error } = await query().range(from, from + 999);
        if (error) throw error;
        out.push(...(data || []));
        if (!data || data.length < 1000) break;
    }
    return out;
}

export async function loadLearningGainRaw(supabase) {
    const [responses, users, surveys, views, programMaterials, profiles, programs] = await Promise.all([
        fetchAll(() => supabase.from('survey_responses').select('id,user_id,survey_id,attempt_type,score,total_scored,percentage,created_at').order('id')),
        fetchAll(() => supabase.from('users').select('id,email,student_id,is_test_account').order('id')),
        fetchAll(() => supabase.from('surveys').select('id,program_id,type').order('id')),
        fetchAll(() => supabase.from('material_views').select('user_id,material_id,first_viewed_at').order('user_id').order('material_id')),
        fetchAll(() => supabase.from('program_materials').select('program_id,material_id').order('program_id').order('material_id')),
        fetchAll(() => supabase.from('profiles').select('id,student_id,program,year_level,age,gender,is_pwd,is_ip').order('id')),
        fetchAll(() => supabase.from('programs').select('id,title').order('id')),
    ]);

    const authIdByEmail = new Map();
    for (let page = 1; ; page += 1) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
        if (error) throw error;
        const list = data?.users || [];
        for (const a of list) if (a.email) authIdByEmail.set(String(a.email).toLowerCase(), a.id);
        if (list.length < 200) break;
    }

    return {
        responses, users, surveys, views, programMaterials, profiles, authIdByEmail,
        programTitles: new Map(programs.map((p) => [p.id, p.title])),
    };
}
