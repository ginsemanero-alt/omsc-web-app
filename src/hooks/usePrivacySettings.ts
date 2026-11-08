import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { PublicPrivacySettings } from '../lib/privacyNotice';

// Reads the public get_privacy_settings() function (callable without signing
// in). Cached for a few minutes so the notice does not re-fetch each time it
// opens. A failure simply means the original wording is shown.
let cache: { at: number; value: PublicPrivacySettings | null } | null = null;
let inflight: Promise<PublicPrivacySettings | null> | null = null;
const TTL_MS = 5 * 60 * 1000;

async function load(): Promise<PublicPrivacySettings | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  if (!inflight) {
    inflight = (async () => {
      try {
        const { data, error } = await supabase.rpc('get_privacy_settings');
        const value = error ? null : ((data as PublicPrivacySettings | null) ?? null);
        cache = { at: Date.now(), value };
        return value;
      } catch {
        return null;
      } finally {
        inflight = null;
      }
    })();
  }
  return inflight;
}

export function usePrivacySettings(): PublicPrivacySettings | null {
  const [settings, setSettings] = useState<PublicPrivacySettings | null>(cache?.value ?? null);
  useEffect(() => {
    let alive = true;
    load().then((value) => {
      if (alive) setSettings(value);
    });
    return () => {
      alive = false;
    };
  }, []);
  return settings;
}
