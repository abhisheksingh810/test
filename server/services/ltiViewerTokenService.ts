import crypto from "crypto";

/**
 * Generate a cryptographically secure random token for LTI viewer sessions
 * @returns Object with token and its hash
 */
export function generateViewerToken(): { token: string; hash: string } {
  // Generate 32 bytes of random data (256 bits)
  const token = crypto.randomBytes(32).toString("base64url");
  
  // Hash the token for storage
  const hash = hashViewerToken(token);
  
  return { token, hash };
}

/**
 * Hash a viewer token using SHA-256
 * @param token - The plain token to hash
 * @returns The hashed token
 */
export function hashViewerToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Verify a viewer token against a stored hash
 * @param token - The plain token to verify
 * @param storedHash - The stored hash to compare against
 * @returns True if the token matches the hash
 */
export function verifyViewerToken(token: string, storedHash: string): boolean {
  const hash = hashViewerToken(token);
  return crypto.timingSafeEqual(
    Buffer.from(hash),
    Buffer.from(storedHash)
  );
}

/**
 * Generate an expiration timestamp for viewer sessions
 * @param hoursFromNow - Number of hours until expiration (default 1)
 * @returns Date object representing expiration time
 */
export function generateViewerExpiry(hoursFromNow: number = 1): Date {
  const expiry = new Date();
  expiry.setHours(expiry.getHours() + hoursFromNow);
  return expiry;
}

/**
 * Check if a viewer session has expired
 * @param expiresAt - The expiration timestamp
 * @returns True if the session has expired
 */
export function isViewerSessionExpired(expiresAt: Date): boolean {
  return new Date() > new Date(expiresAt);
}

/**
 * Rotate a viewer token (generate a new one, invalidating the old)
 * @returns New token and hash
 */
export function rotateViewerToken(): { token: string; hash: string } {
  return generateViewerToken();
}
