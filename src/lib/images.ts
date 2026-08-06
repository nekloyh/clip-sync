/**
 * Attachments are now served from our own origin, which means a stored
 * `image/svg+xml` would run script in the app's origin. Only raster formats are
 * accepted, and the declared MIME type is checked against the file's magic
 * bytes so renaming an HTML file to .png does not get it through.
 */

export const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
] as const;

export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

const EXTENSIONS: Record<AllowedImageType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
};

export function isAllowedImageType(mime: string): mime is AllowedImageType {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(mime);
}

export function extensionFor(mime: AllowedImageType): string {
  return EXTENSIONS[mime];
}

/** Detects the real container from the first bytes; null when unrecognised. */
export function sniffImageType(bytes: Uint8Array): AllowedImageType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return 'image/gif';
  if (startsWith(bytes, [0x42, 0x4d])) return 'image/bmp';

  // RIFF....WEBP
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && matchesAscii(bytes, 8, 'WEBP')) {
    return 'image/webp';
  }
  // ....ftypavif / ftypavis
  if (matchesAscii(bytes, 4, 'ftyp') && (matchesAscii(bytes, 8, 'avif') || matchesAscii(bytes, 8, 'avis'))) {
    return 'image/avif';
  }

  return null;
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, i) => bytes[i] === byte);
}

function matchesAscii(bytes: Uint8Array, offset: number, text: string): boolean {
  if (bytes.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

/** Keeps the display name readable without letting path separators through. */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'image';
  const cleaned = base.replace(/[\x00-\x1f\x7f"']/g, '').trim();
  return (cleaned || 'image').slice(0, 120);
}
