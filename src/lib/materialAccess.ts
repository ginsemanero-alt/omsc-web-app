import { supabase } from './supabase';

// Opening a full IEC material file (PHASE 35).
//
// The full files live in a PRIVATE storage bucket. A material row carries
// the object's path in `file_path`; a signed-in student gets a short-lived
// signed link for it, and a visitor who is not signed in gets nothing (the
// bucket has no public access and the column is not readable by anon).
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

// How long a signed link works. The list is signed again before it runs out
// (see SIGN_REFRESH_MS), so a page left open all day keeps working.
const SIGN_SECONDS = 2 * 60 * 60;
export const SIGN_REFRESH_MS = 50 * 60 * 1000;

interface HasMaterialFile {
  file_path?: string | null;
  file_url?: string | null;
}

// Returns the same rows with `file_url` replaced by a signed link for every
// row that has a `file_path`. One storage call for the whole list. A row
// whose link can't be made keeps its old file_url (which may be a legacy
// public URL) and is logged, so one bad file never breaks the page.
export async function signMaterialRows<T extends HasMaterialFile>(rows: T[]): Promise<T[]> {
  const paths = [...new Set(rows.map((row) => row.file_path).filter((p): p is string => !!p))];
  if (paths.length === 0) return rows;

  const { data, error } = await supabase.storage
    .from(PRIVATE_MATERIAL_BUCKET)
    .createSignedUrls(paths, SIGN_SECONDS);

  if (error || !data) {
    console.warn('Could not sign material links:', error?.message);
    return rows;
  }

  const byPath = new Map<string, string>();
  for (const entry of data) {
    if (entry.path && entry.signedUrl && !entry.error) byPath.set(entry.path, entry.signedUrl);
    else console.warn('Could not sign', entry.path, entry.error);
  }

  return rows.map((row) =>
    row.file_path && byPath.has(row.file_path) ? { ...row, file_url: byPath.get(row.file_path)! } : row
  );
}

// The path part of a URL with the query string (a signed link's token)
// removed and lower-cased, for extension checks such as ".pdf".
export function urlPathOnly(url: string | null | undefined): string {
  return (url || '').split('?')[0].toLowerCase();
}

// True when the original is stored in the private bucket (or is being).
export const hasPrivateFile = (row: HasMaterialFile): boolean => !!row.file_path;
