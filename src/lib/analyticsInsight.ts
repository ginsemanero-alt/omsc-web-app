import { supabase } from './supabase';

// Shown for every failure of the AI service (down, rate-limited, timed out,
// not configured): one clear sentence instead of a silent or technical error.
export const INSIGHT_UNAVAILABLE_MESSAGE = 'Insight is unavailable right now. Please try again later.';

export interface AnalyticsInsightResult {
  section: string;
  insight: string;
  generatedAt: string;
  cached: boolean;
  model: string;
  // The server's hash of the figures this insight was written from.
  dataHash?: string;
}

// Calls /api/analytics-insight (needs the service-role client + the
// OpenRouter key, neither of which belong in the browser). The server
// caches by section + a hash of `metrics`, so this only actually reaches
// OpenRouter when the underlying numbers changed or `regenerate` is true —
// everything else about that (including PII validation) happens
// server-side, not here.
export async function fetchAnalyticsInsight(
  section: string,
  sectionLabel: string,
  metrics: Record<string, unknown>,
  regenerate = false,
  // The age bands the page uses, so the server groups the Learning gain figures the same way.
  ageBrackets?: { label: string; min: number; max: number | null }[]
): Promise<AnalyticsInsightResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('No active session — please sign in again.');
  }

  let response: Response;
  try {
    response = await fetch('/api/analytics-insight', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ section, sectionLabel, metrics, regenerate, ageBrackets }),
    });
  } catch {
    // Offline / blocked: still one clear sentence.
    throw new Error(INSIGHT_UNAVAILABLE_MESSAGE);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    // An expired session or a non-admin has its own, more useful message.
    if (response.status === 401 || response.status === 403) {
      throw new Error(data?.message || 'Please sign in again as an admin to use Insight.');
    }
    // Everything else (502 provider down, 503, 429 daily cap, a platform
    // timeout that returns HTML instead of JSON...) reads the same way.
    throw new Error(INSIGHT_UNAVAILABLE_MESSAGE);
  }

  if (!data?.insight) {
    throw new Error(INSIGHT_UNAVAILABLE_MESSAGE);
  }

  return data as AnalyticsInsightResult;
}

type AgeBrackets = { label: string; min: number; max: number | null }[];

// Asks the server for the saved insight that matches EXACTLY these figures and filters. It never calls the AI and
// never writes. insight is null when nothing is saved for this payload (other filters, newer data, or never made).
// Throws when the server cannot be reached or answers an error, so the caller can use the browser fallback.
export async function fetchLatestInsight(
  section: string,
  metrics: Record<string, unknown>,
  ageBrackets?: AgeBrackets
): Promise<{ hash: string; insight: AnalyticsInsightResult | null }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('No active session.');
  const response = await fetch('/api/admin/analytics-insight/latest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ section, metrics, ageBrackets }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || typeof data.hash !== 'string') throw new Error('Could not look up the saved insight.');
  return { hash: data.hash, insight: (data.insight as AnalyticsInsightResult | null) ?? null };
}

// ---- browser fallback (sessionStorage), used only when the server lookup fails.
// Keyed by a hash of exactly what is sent (section + figures + age bands), so an insight is only ever found again
// for the same figures and filters. It cannot know the server's own figures, so it is labelled as saved in this browser.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export async function insightBrowserKey(section: string, metrics: Record<string, unknown>, ageBrackets?: AgeBrackets): Promise<string | null> {
  try {
    const bytes = new TextEncoder().encode(canonical({ section, metrics, ageBrackets }));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return `omsu-insight:${Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  } catch {
    return null;
  }
}

export function readSavedInsight(key: string | null): AnalyticsInsightResult | null {
  if (!key) return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.insight === 'string' && typeof parsed.generatedAt === 'string' ? (parsed as AnalyticsInsightResult) : null;
  } catch {
    return null;
  }
}

export function saveInsightInBrowser(key: string | null, result: AnalyticsInsightResult) {
  if (!key) return;
  try {
    sessionStorage.setItem(key, JSON.stringify(result));
  } catch {
    /* storage blocked or full: nothing to do */
  }
}
