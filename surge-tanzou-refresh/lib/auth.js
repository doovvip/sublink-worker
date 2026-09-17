import { createHash, createDecipheriv } from 'node:crypto';

/** Preserves the reviewed 2026-09-16 service's encrypted-source contract.
 * The GCM authentication tag validates the supplied token without publishing it.
 * This is compatibility with an existing format, not a new password KDF.
 */
export function sourceForToken(token, encryptedSource) {
  if (typeof token !== 'string' || token.length < 32 || token.length > 512 ||
      !/^[A-Za-z0-9_-]+$/.test(token) || typeof encryptedSource !== 'string' ||
      encryptedSource.length > 12000) throw new Error('Unauthorized');
  const parts = encryptedSource.split('.');
  if (parts.length !== 2 || parts.some(x => !/^[A-Za-z0-9_-]+$/.test(x))) {
    throw new Error('Unauthorized');
  }
  const iv = Buffer.from(parts[0], 'base64url');
  const sealed = Buffer.from(parts[1], 'base64url');
  if (iv.length !== 12 || sealed.length <= 16) throw new Error('Unauthorized');
  const key = createHash('sha256').update(token, 'utf8').digest();
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(sealed.subarray(-16));
    const bytes = Buffer.concat([decipher.update(sealed.subarray(0, -16)), decipher.final()]);
    const value = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return validateSource(value);
  } finally {
    key.fill(0);
  }
}

export function validateSource(value) {
  const url = new URL(value);
  // The verified provider only. Prevent arbitrary URL fetches / SSRF.
  if (url.protocol !== 'https:' || url.hostname !== 'config.tanzcloud.com' ||
      url.port || url.username || url.password || url.hash ||
      !/^\/link\/[A-Za-z0-9_-]+$/.test(url.pathname) ||
      url.searchParams.getAll('sub').length !== 1 || url.searchParams.get('sub') !== '3' ||
      [...url.searchParams.keys()].some(k => k !== 'sub')) {
    throw new Error('Invalid subscription source');
  }
  return url;
}
