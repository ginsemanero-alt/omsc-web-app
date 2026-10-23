// Where to send a student after they sign in (or register and verify their
// email): back to the exact material or program they came from.
//
// The target arrives as ?redirect=<path> on /login, which is user-controlled
// input, so it is validated strictly here and only ever used with the
// router's navigate(). It is also kept in sessionStorage so it survives a
// reload, registration, email verification and a forgot-password detour.

const STORAGE_KEY = 'omsu_return_to';
const MAX_LENGTH = 300;

// Query parameters a return path may carry, and what each may contain.
const ALLOWED_PARAMS: Record<string, RegExp> = {
  material: /^\d{1,12}$/,
  program: /^\d{1,12}$/,
  survey: /^[A-Za-z0-9-]{1,64}$/,
  view: /^results$/,
};

// Returns a normalized in-app path ("/student/materials?material=12"), or
// null when the value is missing or not safe. Only paths under /student/ on
// this same site are accepted, with at most the parameters listed above.
export function safeReturnPath(raw: string | null | undefined): string | null {
  if (!raw || raw.length > MAX_LENGTH) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }

  // Control characters and backslashes are how "/\evil.com" and similar
  // tricks get past a naive prefix check.
  if (/[\u0000-\u001f\u007f\\]/.test(raw) || /[\u0000-\u001f\u007f\\]/.test(decoded)) return null;
  if (!raw.startsWith('/') || raw.startsWith('//') || decoded.startsWith('//')) return null;

  let url: URL;
  try {
    url = new URL(raw, window.location.origin);
  } catch {
    return null;
  }
  if (url.origin !== window.location.origin) return null;

  const segments = url.pathname.split('/');
  if (segments.some((segment) => segment === '..' || segment === '.')) return null;
  if (!url.pathname.startsWith('/student/') || url.pathname.includes('//')) return null;

  const kept = new URLSearchParams();
  for (const [key, value] of url.searchParams.entries()) {
    const rule = ALLOWED_PARAMS[key];
    if (rule && rule.test(value)) kept.set(key, value);
  }
  const query = kept.toString();
  return query ? `${url.pathname}?${query}` : url.pathname;
}

// Remember a (validated) target for after sign-in. An invalid or missing one
// leaves whatever was remembered before alone.
export function rememberReturnTo(raw: string | null | undefined): void {
  const safe = safeReturnPath(raw);
  if (!safe) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, safe);
  } catch {
    // Storage unavailable (private window, blocked site data): the ?redirect
    // parameter still works for the page that carries it.
  }
}

export function readRememberedReturnTo(): string | null {
  try {
    return safeReturnPath(window.sessionStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export function clearReturnTo(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // nothing to clear
  }
}

// The link a "sign in to open this" button should use.
export function signInUrlFor(path: string, mode?: 'register'): string {
  const params = new URLSearchParams();
  if (mode) params.set('mode', mode);
  const safe = safeReturnPath(path);
  if (safe) params.set('redirect', safe);
  return `/login?${params.toString()}`;
}
