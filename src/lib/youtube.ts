// YouTube links on IEC materials. One place decides what a link is, so the
// student IEC library, the program handouts and the admin preview all treat
// the same URL the same way.
//
// Recognised: youtube.com/watch?v=ID, youtu.be/ID (any ?si=... is ignored),
// youtube.com/shorts/ID and youtube.com/embed/ID. An ID is exactly 11
// characters from [A-Za-z0-9_-]. Anything else is null.

const VIDEO_ID = /^[\w-]{11}$/;
const HAS_SCHEME = /^[a-z][a-z\d+.-]*:\/\//i;

// A link typed without "https://" still works.
function toUrl(text: string): URL | null {
  try {
    return new URL(HAS_SCHEME.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
}

export function parseYouTubeId(url: string | null | undefined): string | null {
  const text = String(url ?? '').trim();
  if (!text) return null;

  const parsed = toUrl(text);
  if (!parsed || (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')) return null;

  const host = parsed.hostname.toLowerCase().replace(/^(www|m)\./, '');
  const parts = parsed.pathname.split('/').filter(Boolean);
  let id: string | null = null;

  if (host === 'youtu.be') {
    id = parts[0] ?? null;
  } else if (host === 'youtube.com') {
    if (parts[0] === 'watch') id = parsed.searchParams.get('v');
    else if (parts[0] === 'shorts' || parts[0] === 'embed') id = parts[1] ?? null;
  }

  return id && VIDEO_ID.test(id) ? id : null;
}

// Privacy-enhanced embed: no YouTube cookies until the video is played.
export const youTubeEmbedUrl = (id: string) => `https://www.youtube-nocookie.com/embed/${id}?rel=0`;

// The page to open in a new tab ("Watch on YouTube"). Built from the ID when
// there is one. Without an ID (a channel or playlist link, a mistyped ID) the
// original link is used, but only when it really is a YouTube address over
// plain http(s), never anything else.
export function youTubeWatchUrl(url: string | null | undefined): string | null {
  const id = parseYouTubeId(url);
  if (id) return `https://www.youtube.com/watch?v=${id}`;

  const parsed = toUrl(String(url ?? '').trim());
  if (!parsed || (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')) return null;
  const host = parsed.hostname.toLowerCase().replace(/^(www|m)\./, '');
  return host === 'youtube.com' || host === 'youtu.be' ? parsed.href : null;
}

export const youTubeThumbnailUrl = (id: string) => `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
