import { supabase } from './supabase';

// Opening a full IEC material file (PHASE 35).
//
// The full files live in a PRIVATE storage bucket. A material row carries
// the object's path in `file_path`; a signed-in student gets a short-lived
// signed link for it, and a visitor who is not signed in gets nothing (the
// bucket has no public access and the column is not readable by anon).
//
// An infographic also has `thumb_path`: a small (about 480px, sharp) JPEG in
// the same private bucket that the student library uses for its cards, so
// the grid does not download every full-size original. It is signed like the
// full file and returned as `thumb_url`. The full file is only used when the
// student opens the material.
//
// Rows that have no `file_path` (an external link or a YouTube URL, or a
// file not moved yet) keep using `file_url` unchanged, so the same code
// handles old and new materials.

export const PRIVATE_MATERIAL_BUCKET = 'material-files';

// The public preview made for an infographic (a visitor who is not signed
// in sees only this). Small enough that the text in it can't be read; raise
// the blur if a preview ever turns out to be legible. The one-time
// scripts/migrate-material-files.cjs uses the same numbers.
export const PREVIEW_MAX_WIDTH = 480;
export const PREVIEW_BLUR_PX = 2;

// The sharp card thumbnail for signed-in students: same width, no blur.
// scripts/backfill-card-thumbnails.cjs uses the same numbers.
export const CARD_THUMB_MAX_WIDTH = 480;
export const CARD_THUMB_QUALITY = 0.85;

// How long a signed link works. The list is signed again before it runs out
// (see SIGN_REFRESH_MS), so a page left open all day keeps working.
const SIGN_SECONDS = 2 * 60 * 60;
export const SIGN_REFRESH_MS = 50 * 60 * 1000;

// A signed link is reused (same URL, so the browser can revalidate its cached
// copy instead of downloading it again) until this little time is left on it.
const REUSE_UNTIL_REMAINING_MS = 30 * 60 * 1000;
const CACHE_KEY = 'omsu_signed_urls';

interface CacheEntry {
  url: string;
  exp: number; // epoch ms
}

function readCache(): Record<string, CacheEntry> {
  try {
    return JSON.parse(window.sessionStorage.getItem(CACHE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, CacheEntry>): void {
  try {
    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Storage unavailable: links are simply signed again next time.
  }
}

// Forget every signed link (called on sign-out).
export function clearSignedUrlCache(): void {
  try {
    window.sessionStorage.removeItem(CACHE_KEY);
  } catch {
    // nothing to clear
  }
}

interface HasMaterialFile {
  file_path?: string | null;
  thumb_path?: string | null;
  file_url?: string | null;
}

// Returns the same rows with `file_url` replaced by a signed link for every
// row that has a `file_path`, and `thumb_url` set to a signed link for every
// row that has a `thumb_path`. One storage call for everything that needs a
// new link. A row whose link can't be made keeps its old file_url (which may
// be a legacy public URL) and is logged, so one bad file never breaks the page.
export async function signMaterialRows<T extends HasMaterialFile>(rows: T[]): Promise<T[]> {
  const wanted = [
    ...new Set(rows.flatMap((row) => [row.file_path, row.thumb_path]).filter((p): p is string => !!p)),
  ];
  if (wanted.length === 0) return rows;

  const now = Date.now();
  const cache = readCache();
  const urlByPath = new Map<string, string>();
  const missing: string[] = [];

  for (const path of wanted) {
    const hit = cache[path];
    if (hit && hit.exp - now > REUSE_UNTIL_REMAINING_MS) urlByPath.set(path, hit.url);
    else missing.push(path);
  }

  if (missing.length > 0) {
    const { data, error } = await supabase.storage
      .from(PRIVATE_MATERIAL_BUCKET)
      .createSignedUrls(missing, SIGN_SECONDS);

    if (error || !data) {
      console.warn('Could not sign material links:', error?.message);
    } else {
      for (const entry of data) {
        if (entry.path && entry.signedUrl && !entry.error) {
          urlByPath.set(entry.path, entry.signedUrl);
          cache[entry.path] = { url: entry.signedUrl, exp: now + SIGN_SECONDS * 1000 };
        } else {
          console.warn('Could not sign', entry.path, entry.error);
        }
      }
      writeCache(cache);
    }
  }

  return rows.map((row) => {
    const next: any = { ...row };
    if (row.file_path && urlByPath.has(row.file_path)) next.file_url = urlByPath.get(row.file_path)!;
    if (row.thumb_path && urlByPath.has(row.thumb_path)) next.thumb_url = urlByPath.get(row.thumb_path)!;
    return next as T;
  });
}

// The path part of a URL with the query string (a signed link's token)
// removed and lower-cased, for extension checks such as ".pdf".
export function urlPathOnly(url: string | null | undefined): string {
  return (url || '').split('?')[0].toLowerCase();
}

// True when the original is stored in the private bucket (or is being).
export const hasPrivateFile = (row: HasMaterialFile): boolean => !!row.file_path;
