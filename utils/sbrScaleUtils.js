/**
 * Shared SBR Scale Utilities (Server-Side)
 * Unified 0–4 standards-based grading scale.
 */

export const SCALE_LEVELS = [
  { value: 4, label: 'Exceeds Standard', labelAr: 'يتجاوز المعيار', minPercent: 90, maxPercent: 100, color: '#1a7a1a', description: 'Student consistently demonstrates advanced proficiency.' },
  { value: 3, label: 'Meets Standard', labelAr: 'يلبّي المعيار', minPercent: 75, maxPercent: 89, color: '#2f855a', description: 'Student demonstrates expected proficiency.' },
  { value: 2, label: 'Approaching Standard', labelAr: 'يقترب من المعيار', minPercent: 60, maxPercent: 74, color: '#b7791f', description: 'Student is developing proficiency.' },
  { value: 1, label: 'Below Standard', labelAr: 'دون المعيار', minPercent: 1, maxPercent: 59, color: '#c53030', description: 'Student needs additional support.' },
  { value: 0, label: 'Not Demonstrated', labelAr: 'لم يُظهر أي أداء', minPercent: 0, maxPercent: 0, color: '#718096', description: 'Student has not demonstrated any proficiency.' },
];

export const VALID_MANUAL_SCORES = [0, 1, 2, 3, 4];

/**
 * Convert a percentage (0–100) to a discrete scale level (0–4).
 * @param {number|null} percentage
 * @param {Array} [scaleLevels] - Optional custom levels (defaults to SCALE_LEVELS)
 * @returns {{ value: number|null, label: string, color: string, isNA: boolean }}
 */
export const percentageToScaleLevel = (percentage, scaleLevels) => {
  const pct = Number(percentage);
  if (!Number.isFinite(pct)) {
    return { value: null, label: 'Not Assessed', color: '#a0aec0', isNA: true };
  }

  const levels = Array.isArray(scaleLevels) && scaleLevels.length > 0
    ? scaleLevels
    : SCALE_LEVELS;

  const clamped = Math.max(0, Math.min(100, pct));

  // Check from highest to lowest
  const sorted = [...levels].sort((a, b) => Number(b.value) - Number(a.value));
  for (const level of sorted) {
    if (clamped >= Number(level.minPercent) && clamped <= Number(level.maxPercent)) {
      return { value: level.value, label: level.label, color: level.color, isNA: false };
    }
  }

  // Fallback: lowest level
  const lowest = sorted[sorted.length - 1];
  return { value: lowest.value, label: lowest.label, color: lowest.color, isNA: false };
};

/**
 * Validate a manual score value.
 * @param {*} score
 * @returns {boolean}
 */
export const isValidManualScore = (score) => {
  if (score === null) return true; // null = clear
  const num = Number(score);
  return Number.isInteger(num) && VALID_MANUAL_SCORES.includes(num);
};

/**
 * Compute the effective score: manual overrides auto-computed.
 * @param {{ manualScore: number|null, percentage: number|null }} entry
 * @param {Array} [scaleLevels]
 * @returns {number|null}
 */
export const computeEffectiveScore = (entry, scaleLevels) => {
  if (entry.manualScore !== null && entry.manualScore !== undefined) {
    return entry.manualScore;
  }
  const mapped = percentageToScaleLevel(entry.percentage, scaleLevels);
  return mapped.value;
};
