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
  regenerate = false
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
      body: JSON.stringify({ section, sectionLabel, metrics, regenerate }),
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
