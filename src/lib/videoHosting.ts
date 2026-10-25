import { supabase } from './supabase';

// Uploaded videos are hosted on Cloudinary (PHASE 37). The server signs every
// upload and every playback link; nothing secret is ever in the browser, and a
// signed link is held in memory only, never saved.

export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const VIDEO_TOO_BIG_MESSAGE = 'Video must be 100 MB or less. Please compress it first.';
export const VIDEO_UPLOAD_NOTE =
  'Max 100 MB. Students watch the file exactly as you upload it, so compress it first. For long videos, use a YouTube link instead.';
export const VIDEO_SIZE_TIP = 'Aim for 15 MB or less per video.';
export const VIDEO_INCOMPATIBLE_WARNING =
  'This video may not play on some phones or browsers. Please export it as MP4 (H.264) and upload again.';
export const VIDEO_PLAY_FAILED_MESSAGE =
  "This video can't play on your device right now. Please try another browser or let the Guidance Office know.";

const FREE_PLAN_CREDITS = 25;
const MB = 1024 * 1024;

export function formatFileSize(bytes: number): string {
  return bytes >= MB ? `${(bytes / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// Cloudinary charges 1 credit per GB delivered, and students download the
// original: 100 full views of a file of X MB use X / 10 credits.
export function creditsPer100Views(bytes: number): string {
  return (bytes / MB / 10).toFixed(1);
}
export { FREE_PLAN_CREDITS };

// Plays everywhere: an MP4 container with H.264 video. Anything else (HEVC,
// .mov, webm...) is kept as uploaded but flagged to the admin. A file whose
// codec is unknown (null) is not flagged.
export function isVideoCompatible(format: string | null | undefined, codec: string | null | undefined): boolean {
  if (!format || !codec) return true;
  return ['mp4', 'm4v'].includes(format.toLowerCase()) && codec.toLowerCase() === 'h264';
}

// null when the file is fine, otherwise the message to show.
export function checkVideoFile(file: File): string | null {
  if (!file.type.startsWith('video/')) return 'Please select a valid video file.';
  if (file.size > MAX_VIDEO_BYTES) return VIDEO_TOO_BIG_MESSAGE;
  return null;
}

async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('No active session — please log in again.');
  return fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, ...(init.headers || {}) },
  });
}

async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || 'Something went wrong. Please try again.');
  return data as T;
}

export interface HostedVideo {
  publicId: string;
  resourceType: 'video';
  bytes: number;
  duration: number | null;
  // Read from Cloudinary's upload response (the original file's container and codec).
  format: string | null;
  codec: string | null;
  // The poster frame, fetched while the admin is still in the upload dialog.
  poster: Blob | null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// signature -> direct upload (with progress) -> wait until the poster frame is
// ready. Throws with a message fit to show.
export async function uploadHostedVideo(file: File, onProgress: (text: string) => void): Promise<HostedVideo> {
  const problem = checkVideoFile(file);
  if (problem) throw new Error(problem);

  const sign = await apiJson<{ uploadUrl: string; publicId: string; fields: Record<string, string> }>(
    '/api/admin/video-upload-signature',
    { method: 'POST', body: JSON.stringify({ size: file.size, type: file.type }) }
  );

  // Cloudinary's reply to the upload carries the duration (the later status
  // check does not), so it is read from there.
  let uploadedDuration: number | null = null;
  let uploadedFormat: string | null = null;
  let uploadedCodec: string | null = null;
  await new Promise<void>((resolve, reject) => {
    const form = new FormData();
    Object.entries(sign.fields).forEach(([key, value]) => form.append(key, value));
    form.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', sign.uploadUrl);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(`Uploading video… ${Math.round((event.loaded / event.total) * 100)}%`);
    };
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) return reject(new Error('The video upload was refused. Please try again.'));
      try {
        const reply = JSON.parse(xhr.responseText);
        if (typeof reply.duration === 'number') uploadedDuration = Math.round(reply.duration * 10) / 10;
        if (typeof reply.format === 'string') uploadedFormat = reply.format.toLowerCase();
        if (typeof reply.video?.codec === 'string') uploadedCodec = reply.video.codec.toLowerCase();
      } catch {
        uploadedDuration = null;
      }
      resolve();
    };
    xhr.onerror = () => reject(new Error('The video upload failed. Check your connection and try again.'));
    xhr.send(form);
  });

  // The poster frame is made right after the upload; wait for it (up to ~6 minutes).
  onProgress('Checking the video…');
  for (let attempt = 0; attempt < 120; attempt++) {
    const result = await apiJson<{ status: string; bytes?: number; duration?: number | null; posterUrl?: string }>(
      '/api/admin/video-finalize',
      { method: 'POST', body: JSON.stringify({ publicId: sign.publicId }) }
    ).catch(async (error) => {
      await deleteHostedVideoById(sign.publicId).catch(() => {});
      throw error;
    });
    if (result.status === 'ready') {
      let poster: Blob | null = null;
      try {
        const frame = await fetch(result.posterUrl as string);
        if (frame.ok) poster = await frame.blob();
      } catch {
        poster = null;
      }
      return { publicId: sign.publicId, resourceType: 'video', bytes: result.bytes || file.size, duration: result.duration ?? uploadedDuration, format: uploadedFormat || (file.name.split('.').pop() || '').toLowerCase() || null, codec: uploadedCodec, poster };
    }
    await sleep(3000);
  }
  await deleteHostedVideoById(sign.publicId).catch(() => {});
  throw new Error('The video took too long to check. Please try again with a smaller file.');
}

// An upload nothing references (cancelled form, replaced video).
export async function deleteHostedVideoById(publicId: string): Promise<void> {
  await apiJson('/api/admin/delete-video', { method: 'POST', body: JSON.stringify({ publicId }) });
}

// An archived material's video, before its row is deleted.
export async function deleteHostedVideoForMaterial(materialId: number): Promise<void> {
  await apiJson('/api/admin/delete-video', { method: 'POST', body: JSON.stringify({ materialId }) });
}

export async function rotateHostedVideo(materialId: number): Promise<void> {
  await apiJson('/api/admin/video-rotate', { method: 'POST', body: JSON.stringify({ materialId }) });
}

export interface VideoUsage {
  creditsUsed: number;
  creditsLimit: number;
  percent: number;
  warn: boolean;
}

export async function fetchVideoUsage(): Promise<VideoUsage> {
  return apiJson<VideoUsage>('/api/admin/video-usage');
}

// Signed playback link for a signed-in student. Kept in memory for the life
// of the page only: never in storage, never in the database.
const playbackLinks = new Map<number, string>();
// Two players asking at the same moment share one request.
const pendingLinks = new Map<number, Promise<string>>();

export async function fetchPlaybackUrl(materialId: number, force = false): Promise<string> {
  if (!force && playbackLinks.has(materialId)) return playbackLinks.get(materialId)!;
  if (!force && pendingLinks.has(materialId)) return pendingLinks.get(materialId)!;
  const request = apiJson<{ url: string }>(`/api/video-url?material=${materialId}`)
    .then((data) => {
      playbackLinks.set(materialId, data.url);
      return data.url;
    })
    .finally(() => pendingLinks.delete(materialId));
  pendingLinks.set(materialId, request);
  return request;
}
