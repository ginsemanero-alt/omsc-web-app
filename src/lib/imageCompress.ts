/**
 * Client-side image resize/compress before upload. Poster and thumbnail
 * images were being uploaded at whatever resolution the admin's camera/
 * screenshot produced (often 1000px+ wide, several hundred KB) even though
 * they're only ever displayed at a few hundred pixels — this shrinks them
 * to a sane max dimension and re-encodes as JPEG at a reasonable quality
 * before they ever reach Supabase Storage.
 *
 * Non-image files (PDF, video, audio) and already-small images are passed
 * through untouched.
 */
export async function compressImageFile(
  file: File,
  { maxWidth = 1280, maxHeight = 1280, quality = 0.8 }: { maxWidth?: number; maxHeight?: number; quality?: number } = {}
): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml' || file.type === 'image/gif') {
    // SVGs are already tiny/vector, and canvas re-encoding would break
    // animated GIFs — leave both alone.
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);

    let { width, height } = bitmap;
    if (width <= maxWidth && height <= maxHeight) {
      // Already small enough — resizing further would only lose quality
      // for no size benefit.
      bitmap.close?.();
      return file;
    }

    const scale = Math.min(maxWidth / width, maxHeight / height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality)
    );

    if (!blob || blob.size >= file.size) {
      // Compression didn't actually help (rare, but possible for already
      // heavily-compressed images) — keep the original.
      return file;
    }

    const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], newName, { type: 'image/jpeg' });
  } catch {
    // If the browser can't decode/re-encode it for any reason, upload the
    // original rather than blocking the admin's workflow.
    return file;
  }
}


/**
 * A small public preview of an image (PHASE 35): used as the thumbnail
 * visitors who are not signed in see for an infographic. The full image is
 * kept in the private bucket, so the preview is deliberately small (and can
 * be blurred) so the text in it cannot be read.
 */
export async function makePreviewThumbnail(
  file: File,
  { maxWidth = 480, blurPx = 0, quality = 0.6 }: { maxWidth?: number; blurPx?: number; quality?: number } = {}
): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot create the preview image.');

  if (blurPx > 0) ctx.filter = `blur(${blurPx}px)`;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('Could not create the preview image.');

  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
}
