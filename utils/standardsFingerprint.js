import crypto from 'crypto';

/**
 * Compute a canonical standards fingerprint from an array of standard IDs.
 * Sorts IDs alphabetically then hashes with SHA-256 for fast equality checks.
 * @param {Array<string|ObjectId>} standardIds
 * @returns {string} hex fingerprint
 */
export function computeStandardsFingerprint(standardIds = []) {
  const sorted = standardIds
    .map((id) => String(id).trim())
    .filter(Boolean)
    .sort();
  if (sorted.length === 0) return '';
  return crypto.createHash('sha256').update(sorted.join('|')).digest('hex');
}

/**
 * Check whether two fingerprints match (exact standards set equality).
 */
export function fingerprintsMatch(fp1, fp2) {
  return typeof fp1 === 'string' && typeof fp2 === 'string' && fp1 === fp2;
}
