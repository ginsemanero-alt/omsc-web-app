import { supabase } from './supabase';

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

  const response = await fetch('/api/analytics-insight', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ section, sectionLabel, metrics, regenerate }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.message || 'Failed to generate insight.');
  }

  return data as AnalyticsInsightResult;
}
